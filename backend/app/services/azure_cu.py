"""
Azure Content Understanding service wrapper — SDK edition.

Uses ContentUnderstandingClient (azure-ai-contentunderstanding) with
AzureKeyCredential.  The SDK handles LRO polling internally; we bridge
the synchronous SDK call into the async FastAPI event loop via
asyncio.to_thread().

Two separate client factories keep Standard-mode and Pro-mode traffic
isolated.  Both use the same SDK; the only difference is which Azure CU
endpoint and API key they target (configured via .env).

  Standard mode — _build_standard_client()
    Used exclusively by the file-analysis flow (analyze_file / extract_fields).
    Always talks to AZURE_CU_ENDPOINT with AZURE_CU_KEY.

  Pro mode — _build_pro_client()
    Used exclusively by the Pro analyzer listing / detail flow.
    Talks to PRO_AZURE_CU_ENDPOINT / PRO_AZURE_CU_KEY if set in .env,
    otherwise falls back to the same AZURE_CU_ENDPOINT / AZURE_CU_KEY.
"""

from __future__ import annotations

import asyncio
import base64 as _b64
import io as _io
import json as _json
import logging
import re
import time
import urllib.error
import urllib.request
from typing import Any
from urllib.parse import quote as _url_quote

# pypdf is used as a fallback to merge multiple PDF documents into a single
# file when the SDK path fails.  The primary Pro-mode analysis path now uses
# the SDK client with 2025-11-01 which natively supports multi-input
# ({"inputs": [...]}) so that each file is submitted with its original name
# and the AI model can distinguish PO vs Invoice documents correctly.
try:
    from pypdf import PdfReader as _PdfReader, PdfWriter as _PdfWriter  # type: ignore
    _PYPDF_AVAILABLE = True
except ImportError:  # pragma: no cover
    _PYPDF_AVAILABLE = False

from azure.ai.contentunderstanding import ContentUnderstandingClient
from azure.ai.contentunderstanding.models import AnalysisInput
from azure.core.credentials import AzureKeyCredential
from azure.core.exceptions import HttpResponseError

from app.config import settings
from app.models.schemas import FieldResult

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# SDK client factories
# ---------------------------------------------------------------------------


def _build_standard_client() -> ContentUnderstandingClient:
    """Client for Standard-mode analyze operations."""
    return ContentUnderstandingClient(
        endpoint=settings.AZURE_CU_ENDPOINT,
        credential=AzureKeyCredential(settings.AZURE_CU_KEY),
        api_version=settings.AZURE_CU_API_VERSION,
    )


def _build_pro_client() -> ContentUnderstandingClient:
    """Client for Pro-mode analyzer listing/detail operations.

    Uses PRO_AZURE_CU_ENDPOINT / PRO_AZURE_CU_KEY when configured in .env,
    falling back to the Standard-mode credentials otherwise.  This lets both
    modes point at the same resource during development while allowing them to
    be split across different Azure resources in production.
    """
    return ContentUnderstandingClient(
        endpoint=settings.pro_cu_endpoint,
        credential=AzureKeyCredential(settings.pro_cu_key),
        api_version=settings.AZURE_CU_API_VERSION,
    )


# Keep the old name as an alias so any code outside this module that imported
# _build_client() directly continues to work unchanged.
_build_client = _build_standard_client


# ---------------------------------------------------------------------------
# Synchronous SDK call — runs in a thread pool executor
# ---------------------------------------------------------------------------


def _sdk_analyze(
    file_bytes: bytes,
    content_type: str,
    analyzer_id: str,
    filename: str,
) -> dict[str, Any]:
    """
    Submit *file_bytes* via AnalysisInput to the Azure CU SDK and block
    until the LRO completes.  Uses the ``inputs=`` keyword (list of
    AnalysisInput) so that name and mime_type are properly transmitted.

    This function is synchronous; always call it via ``asyncio.to_thread``.
    """
    logger.info(
        "[CU] Submitting | analyzer_id=%s | filename=%s | mime_type=%s | size_bytes=%d",
        analyzer_id,
        filename,
        content_type,
        len(file_bytes),
    )

    if len(file_bytes) == 0:
        raise AzureCUError("File bytes are empty — nothing was sent to Azure.")

    client = _build_client()

    # Use inputs= with AnalysisInput so mime_type and name are included.
    # Only data is set; url is NOT set (local upload, not a public URL).
    analysis_input = AnalysisInput(
        data=file_bytes,       # raw bytes — NOT base64-encoded
        name=filename,
        mime_type=content_type,
    )
    poller = client.begin_analyze(
        analyzer_id,
        inputs=[analysis_input],
    )
    result = poller.result()

    logger.info("[CU] Analysis succeeded | analyzer_id=%s", analyzer_id)

    # AnalyzeResult SDK model → plain dict for JSON serialisation
    if hasattr(result, "as_dict"):
        return result.as_dict()
    if isinstance(result, dict):
        return result
    # Last-resort fallback
    return vars(result)


# ---------------------------------------------------------------------------
# Public async entry point
# ---------------------------------------------------------------------------


async def analyze_file(
    file_bytes: bytes,
    content_type: str,
    analyzer_id: str,
    filename: str = "upload",
) -> tuple[dict[str, Any], float]:
    """
    Async wrapper around the synchronous SDK call.
    Returns ``(result_dict, latency_ms)``.
    Raises ``AzureCUError`` on any failure.
    """
    start = time.perf_counter()
    try:
        raw_result = await asyncio.to_thread(
            _sdk_analyze, file_bytes, content_type, analyzer_id, filename
        )
    except HttpResponseError as exc:
        code = exc.error.code if exc.error else exc.reason or "Unknown"
        raise AzureCUError(
            f"Azure CU request failed ({code}): {exc.error.message if exc.error else exc}",
            detail=str(exc),
        ) from exc
    except Exception as exc:
        raise AzureCUError(str(exc)) from exc

    elapsed_ms = (time.perf_counter() - start) * 1000
    return raw_result, round(elapsed_ms, 2)


# ---------------------------------------------------------------------------
# Pro-mode SDK analyze (primary) + REST fallback
# Primary path: _sdk_pro_analyze uses _build_pro_client() with 2025-11-01
#   → submits all files as named AnalysisInput objects in one begin_analyze call
#   → Azure model sees each file separately and can identify PO vs Invoice
# Fallback: _rest_pro_analyze uses 2025-05-01-preview REST
#   → tries multi-input format first, then PDF merge, then per-file sequential
# Standard-mode functions above are never modified.
# ---------------------------------------------------------------------------


def _sdk_pro_analyze(
    inputs: list[tuple[bytes, str, str]],  # (file_bytes, content_type, filename)
    analyzer_id: str,
) -> dict[str, Any]:
    """Submit multiple files to the Pro Azure CU resource via the SDK.

    Uses ``_build_pro_client()`` which targets ``AZURE_CU_API_VERSION``
    (``2025-11-01``).  That GA version natively supports the multi-input
    ``{"inputs": [...]}`` format via ``begin_analyze(inputs=[...])``, so
    each file is submitted with its original name and MIME type preserved.

    The AI model receives named inputs (e.g. ``"PO.pdf"``, ``"Invoice1.pdf"``)
    instead of a single anonymous merged PDF, giving it the document-identity
    signals it needs to correctly populate cross-document comparison fields
    such as ``quantityMismatches`` and ``priceMismatches``.

    This is the same approach the Azure portal uses.
    """
    logger.info(
        "[CU-PRO] SDK | analyzer_id=%s | file_count=%d | files=%s",
        analyzer_id,
        len(inputs),
        [name for _, _, name in inputs],
    )

    analysis_inputs = [
        AnalysisInput(
            data=file_bytes,        # raw bytes; SDK handles base64 encoding
            name=filename,
            mime_type=content_type,
        )
        for file_bytes, content_type, filename in inputs
    ]

    client = _build_pro_client()
    poller = client.begin_analyze(analyzer_id, inputs=analysis_inputs)
    result = poller.result()

    logger.info("[CU-PRO] SDK analysis succeeded | analyzer_id=%s", analyzer_id)

    if hasattr(result, "as_dict"):
        return result.as_dict()
    if isinstance(result, dict):
        return result
    return vars(result)


def _merge_pdfs(
    inputs: list[tuple[bytes, str, str]],
) -> bytes | None:
    """Merge multiple PDF files into a single PDF using pypdf.

    All inputs must be application/pdf (checked by content-type or extension).
    Returns merged PDF bytes, or ``None`` if:
    - pypdf is not installed
    - any input is not a PDF
    - merging fails for any reason (caller falls back to per-file approach)
    """
    if not _PYPDF_AVAILABLE:
        logger.debug("[CU-PRO] pypdf not installed — skipping merge")
        return None

    for _bytes, content_type, filename in inputs:
        ct = (content_type or "").lower().split(";")[0].strip()
        if ct != "application/pdf" and not filename.lower().endswith(".pdf"):
            logger.debug(
                "[CU-PRO] Non-PDF input '%s' (%s) — skipping merge", filename, ct
            )
            return None

    try:
        writer = _PdfWriter()
        for file_bytes, _, filename in inputs:
            reader = _PdfReader(_io.BytesIO(file_bytes))
            for page in reader.pages:
                writer.add_page(page)
        out = _io.BytesIO()
        writer.write(out)
        merged = out.getvalue()
        logger.info(
            "[CU-PRO] Merged %d PDFs into single document (%d bytes)",
            len(inputs),
            len(merged),
        )
        return merged
    except Exception as exc:
        logger.warning("[CU-PRO] PDF merge failed (%s) — falling back to per-file", exc)
        return None


def _submit_pro_file(
    file_bytes: bytes,
    filename: str,
    analyze_url: str,
    key: str,
) -> str:
    """POST one file to the Pro analyze endpoint using the flat format:
    ``{"name": ..., "data": <base64>}``.

    Returns the ``operation-location`` URL for polling.
    """
    payload = {
        "name": filename,
        "data": _b64.b64encode(file_bytes).decode("ascii"),
    }
    body = _json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        analyze_url,
        data=body,
        headers={
            "Ocp-Apim-Subscription-Key": key,
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            op_loc: str = resp.headers.get("operation-location", "")
    except urllib.error.HTTPError as exc:
        body_text = exc.read().decode("utf-8", errors="replace")
        logger.error(
            "[CU-PRO] Analyze POST failed for '%s' (HTTP %d): %s",
            filename, exc.code, body_text,
        )
        raise AzureCUError(
            f"Azure CU Pro analyze failed (HTTP {exc.code}): {exc.reason}",
            detail=body_text,
        ) from exc
    if not op_loc:
        raise AzureCUError(
            "No operation-location header returned by Azure CU Pro analyze."
        )
    return op_loc


def _submit_pro_multi(
    inputs: list[tuple[bytes, str, str]],
    analyze_url: str,
    key: str,
) -> str:
    """POST multiple files to the Pro analyze endpoint in a single request
    using the multi-input format:
    ``{"inputs": [{"name": ..., "data": <base64>, "mimeType": ...}, ...]}``.

    This is the format the Azure portal and SDK use.  Sending files as
    separate named inputs preserves the original filenames (e.g. "PO.pdf",
    "Invoice.pdf"), giving the AI model the document-identity information it
    needs to correctly populate cross-document fields such as
    ``quantityMismatches`` and ``priceMismatches``.

    Returns the ``operation-location`` URL for polling.
    Raises ``AzureCUError`` on HTTP failure (caller may fall back to PDF merge).
    """
    payload = {
        "inputs": [
            {
                "name": filename,
                "data": _b64.b64encode(file_bytes).decode("ascii"),
                "mimeType": content_type,
            }
            for file_bytes, content_type, filename in inputs
        ]
    }
    body = _json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        analyze_url,
        data=body,
        headers={
            "Ocp-Apim-Subscription-Key": key,
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            op_loc: str = resp.headers.get("operation-location", "")
    except urllib.error.HTTPError as exc:
        body_text = exc.read().decode("utf-8", errors="replace")
        logger.warning(
            "[CU-PRO] Multi-input POST failed (HTTP %d): %s",
            exc.code, body_text,
        )
        raise AzureCUError(
            f"Azure CU Pro multi-input analyze failed (HTTP {exc.code}): {exc.reason}",
            detail=body_text,
        ) from exc
    if not op_loc:
        raise AzureCUError(
            "No operation-location header returned by Azure CU Pro multi-input analyze."
        )
    return op_loc


def _poll_pro_operation(
    operation_location: str,
    key: str,
    analyzer_id: str,
    timeout: float = 600.0,
) -> dict[str, Any]:
    """Poll a Pro analyze LRO until it succeeds or fails (max ``timeout`` s)."""
    poll_headers = {"Ocp-Apim-Subscription-Key": key}
    interval = 2.0
    start_poll = time.perf_counter()

    while True:
        if time.perf_counter() - start_poll > timeout:
            raise AzureCUError(
                f"Pro analysis timed out after {int(timeout)}s for analyzer '{analyzer_id}'."
            )
        time.sleep(interval)

        poll_req = urllib.request.Request(operation_location, headers=poll_headers)
        try:
            with urllib.request.urlopen(poll_req, timeout=30) as resp:
                result: dict[str, Any] = _json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            err_body = exc.read().decode("utf-8", errors="replace")
            raise AzureCUError(
                f"Pro analysis poll failed (HTTP {exc.code}): {exc.reason}",
                detail=err_body,
            ) from exc

        status_val: str = (result.get("status") or "").lower()
        if status_val == "succeeded":
            return result
        if status_val in ("failed", "cancelled", "canceled"):
            error_detail = result.get("error") or result.get("errors") or {}
            raise AzureCUError(
                f"Pro analysis {status_val} for analyzer '{analyzer_id}'.",
                detail=_json.dumps(error_detail),
            )


def _rest_pro_analyze(
    inputs: list[tuple[bytes, str, str]],  # (file_bytes, content_type, filename)
    analyzer_id: str,
) -> dict[str, Any]:
    """Submit one or more files to the Pro Azure CU resource via REST.

    Multi-file strategy (in order of preference):
    1. **Multi-input** — send all files in a single ``{"inputs": [...]}``
       request, preserving the original filenames (e.g. "PO.pdf",
       "Invoice.pdf").  This is the same format the Azure portal and SDK use.
       The model can read the filenames and use them as document-identity
       signals, enabling consistent population of cross-document fields
       (quantityMismatches, priceMismatches, totalsMatch, etc.).
    2. **PDF merge** — if Strategy 1 fails (e.g. API version does not support
       multi-input), merge all PDFs into one document and re-submit.  Falls
       back to Strategy 3 for non-PDF inputs.
    3. **Per-file sequential** — last resort.  Each file is submitted
       separately and the ``contents`` arrays are merged client-side.
       Cross-document fields will be null in this mode.
    """
    if not inputs:
        raise AzureCUError("At least one input file is required for Pro analyze.")

    endpoint = settings.pro_cu_endpoint
    api_version = settings.pro_cu_api_version
    key = settings.pro_cu_key

    logger.info(
        "[CU-PRO] Submitting | analyzer_id=%s | file_count=%d | files=%s",
        analyzer_id,
        len(inputs),
        [name for _, _, name in inputs],
    )

    analyze_url = (
        f"{endpoint}/contentunderstanding/analyzers/"
        f"{_url_quote(analyzer_id, safe='')}:analyze"
        f"?api-version={api_version}"
    )

    # ── Strategy 1: multi-input (preferred for ≥2 files) ────────────────────
    # Send all files in one request as {"inputs": [{name, data, mimeType}, ...]}.
    # The Azure portal uses this format; named inputs give the model document
    # identity so it can correctly reason about PO vs Invoice fields.
    if len(inputs) > 1:
        try:
            op_loc = _submit_pro_multi(inputs, analyze_url, key)
            logger.info(
                "[CU-PRO] Submitted %d files as multi-input | polling at %s",
                len(inputs), op_loc,
            )
            result = _poll_pro_operation(op_loc, key, analyzer_id)
            logger.info("[CU-PRO] Multi-input analysis succeeded | analyzer_id=%s", analyzer_id)
            return result
        except AzureCUError as exc:
            logger.warning(
                "[CU-PRO] Multi-input failed (%s) — falling back to PDF merge", exc
            )

    # ── Strategy 2: merge all PDFs into a single document (fallback) ─────────
    # Used when Strategy 1 fails or when there is only one input.
    if len(inputs) > 1:
        merged_pdf = _merge_pdfs(inputs)
        if merged_pdf is not None:
            merged_name = "combined_documents.pdf"
            op_loc = _submit_pro_file(merged_pdf, merged_name, analyze_url, key)
            logger.info(
                "[CU-PRO] Submitted merged PDF (%d bytes) | polling at %s",
                len(merged_pdf), op_loc,
            )
            result = _poll_pro_operation(op_loc, key, analyzer_id)
            logger.info("[CU-PRO] Merged-PDF analysis succeeded | analyzer_id=%s", analyzer_id)
            return result

    # ── Strategy 3: per-file sequential (last resort) ───────────────────────
    # Each file gets its own LRO; results are merged client-side.
    # Cross-document fields will be null in this mode.
    op_locations: list[tuple[str, str]] = []  # (op_location, filename)
    for file_bytes, _content_type, filename in inputs:
        op_loc = _submit_pro_file(file_bytes, filename, analyze_url, key)
        op_locations.append((op_loc, filename))
        logger.info("[CU-PRO] Submitted '%s' | polling at %s", filename, op_loc)

    # Poll all LROs and collect results.
    results: list[dict[str, Any]] = []
    for op_loc, filename in op_locations:
        logger.info("[CU-PRO] Polling '%s' | operation_location=%s", filename, op_loc)
        result = _poll_pro_operation(op_loc, key, analyzer_id)
        logger.info("[CU-PRO] '%s' succeeded", filename)
        results.append(result)

    if len(results) == 1:
        logger.info("[CU-PRO] Analysis succeeded | analyzer_id=%s", analyzer_id)
        return results[0]

    # Merge contents from all per-file results into a single synthetic result.
    # Prefer the first non-null value for each field key so that fields
    # populated in an earlier file are not overwritten by null from a later file.
    merged = results[0]
    merged_contents: list[dict[str, Any]] = []
    for r in results:
        inner = r.get("result") if isinstance(r.get("result"), dict) else r
        merged_contents.extend(inner.get("contents") or [])

    if isinstance(merged.get("result"), dict):
        merged["result"]["contents"] = merged_contents
    else:
        merged["contents"] = merged_contents

    logger.info("[CU-PRO] Analysis succeeded (per-file merge) | analyzer_id=%s", analyzer_id)
    return merged


async def pro_analyze_file(
    inputs: list[tuple[bytes, str, str]],  # (file_bytes, content_type, filename)
    analyzer_id: str,
) -> tuple[dict[str, Any], float]:
    """Async entry point for Pro (Foundry) analyzer runs.

    ``inputs`` is a list of ``(file_bytes, content_type, filename)`` tuples.
    Test files and reference files are both passed here — the analyzer uses
    its own schema to reason across all of them.

    Strategy:
    1. SDK path (primary) — uses ``_sdk_pro_analyze`` with ``2025-11-01``.
       Each file is sent as a named ``AnalysisInput`` so the AI model sees
       original filenames, giving it the document-identity context it needs
       to correctly populate cross-document comparison fields.
    2. REST fallback — if the SDK path raises any error (e.g. the analyzer
       is not reachable via ``2025-11-01``), falls back to
       ``_rest_pro_analyze`` which uses ``2025-05-01-preview`` REST calls.

    Returns ``(result_dict, latency_ms)``.
    Raises ``AzureCUError`` on any failure.
    """
    start = time.perf_counter()

    # ── Primary: SDK with 2025-11-01 (native multi-input) ───────────────────
    try:
        raw_result = await asyncio.to_thread(_sdk_pro_analyze, inputs, analyzer_id)
        elapsed_ms = (time.perf_counter() - start) * 1000
        return raw_result, round(elapsed_ms, 2)
    except (HttpResponseError, AzureCUError) as exc:
        logger.warning(
            "[CU-PRO] SDK path failed (%s) — falling back to REST (2025-05-01-preview)",
            exc,
        )
    except Exception as exc:
        logger.warning(
            "[CU-PRO] SDK path unexpected error (%s) — falling back to REST",
            exc,
        )

    # ── Fallback: REST with 2025-05-01-preview ───────────────────────────────
    try:
        raw_result = await asyncio.to_thread(_rest_pro_analyze, inputs, analyzer_id)
    except AzureCUError:
        raise
    except Exception as exc:
        raise AzureCUError(str(exc)) from exc

    elapsed_ms = (time.perf_counter() - start) * 1000
    return raw_result, round(elapsed_ms, 2)


# ---------------------------------------------------------------------------
# Field extraction & flattening
# ---------------------------------------------------------------------------


def extract_fields(result: dict[str, Any]) -> list[FieldResult]:
    """
    Locate the ``fields`` dict inside the Azure CU result payload and
    return a flat list of `FieldResult` objects suitable for the frontend.

    Handles both result structures:
    - ``result.contents[].fields``          (audio/document flat shape)
    - ``result.documents[].fields``         (preview/alternative layout)
    - ``result.result.contents[].fields``   (video SDK wrapper shape)

    The Azure CU SDK wraps video results inside a nested ``"result"`` key:
      { "status": "succeeded", "result": { "contents": [...] } }
    Audio and document results are typically flat (no ``"result"`` wrapper).
    Unwrapping here means we look for ``contents``/``documents`` at whichever
    level they actually exist — so audio behaviour is unchanged.
    """
    raw_fields: dict[str, Any] = {}

    # Unwrap SDK result wrapper when present.
    # If the top-level dict has a "result" key that is itself a dict, prefer
    # searching inside it.  We try the outer level as well so that flat shapes
    # (audio, documents) continue to work without any change.
    search_candidates: list[dict[str, Any]] = [result]
    nested = result.get("result")
    if isinstance(nested, dict):
        search_candidates.insert(0, nested)  # prefer inner; fall back to outer

    for candidate in search_candidates:
        for container_key in ("contents", "documents"):
            container = candidate.get(container_key)
            if isinstance(container, list) and container:
                # Aggregate fields from ALL blocks — multi-page PDFs / videos
                # may have fields distributed across content blocks.
                # Use first-non-null-wins semantics: a typed value already
                # collected from an earlier block must not be overwritten by
                # a null entry from a later block (which dict.update() would do).
                for block in container:
                    block_fields = block.get("fields") or {}
                    if isinstance(block_fields, dict):
                        for key, new_field in block_fields.items():
                            if key not in raw_fields:
                                raw_fields[key] = new_field
                            else:
                                # Only upgrade if the existing entry is null/absent
                                # and the new entry carries a real typed value.
                                old_field = raw_fields[key]
                                if isinstance(old_field, dict) and isinstance(new_field, dict):
                                    old_type = old_field.get("type", "string")
                                    old_vkey = _VALUE_KEY_MAP.get(old_type)
                                    new_vkey = _VALUE_KEY_MAP.get(new_field.get("type", "string"))
                                    old_has_value = bool(
                                        old_vkey and old_field.get(old_vkey) is not None
                                    )
                                    new_has_value = bool(
                                        new_vkey and new_field.get(new_vkey) is not None
                                    )
                                    if not old_has_value and new_has_value:
                                        raw_fields[key] = new_field
                                    # else: keep existing (first real value wins)
                if raw_fields:
                    break
        if raw_fields:
            break  # found fields in this candidate; stop searching

    if not raw_fields:
        # Fallback: top-level fields key
        raw_fields = result.get("fields", {})

    return _flatten_fields(raw_fields, prefix="")


def _flatten_fields(
    fields: dict[str, Any],
    prefix: str,
) -> list[FieldResult]:
    """Recursively flatten a fields dict into a list of FieldResult."""
    output: list[FieldResult] = []

    for name, field in fields.items():
        full_name = f"{prefix}.{name}" if prefix else name
        field_type: str = field.get("type", "string")
        confidence: float | None = _safe_confidence(field.get("confidence"))

        if field_type == "array":
            # Distinguish between explicitly-null (not found) and empty array.
            raw_arr = (
                field.get("valueArray")
                if "valueArray" in field
                else field.get("value_array")
            )
            if raw_arr is None:
                # valueArray key absent or explicitly null → field not found.
                output.append(
                    FieldResult(name=full_name, value=None, confidence=confidence)
                )
                continue
            items: list[dict] = raw_arr if isinstance(raw_arr, list) else []
            if not items:
                output.append(
                    FieldResult(name=full_name, value="[]", confidence=confidence)
                )
                continue
            # Limit to first 50 items to avoid enormous payloads.
            # Track how many items actually yielded an extractable value so
            # that we can treat the whole array as "not found" (null) when
            # every item has an absent typed-value key.  This matches Azure
            # portal behaviour: if valueArray is populated but each item has
            # no valueString / typed value key, the portal shows "(Not found)"
            # for the field — surfacing those items with value=null would make
            # the demo show fake populated arrays.
            items_added = 0
            for idx, item in enumerate(items[:50]):
                item_prefix = f"{full_name}[{idx}]"
                if item.get("type") == "object":
                    # Resolve valueObject carefully to distinguish null (not
                    # found) from an absent key (treat as null too).
                    raw_obj = (
                        item.get("valueObject")
                        if "valueObject" in item
                        else item.get("value_object")
                    )
                    if raw_obj and isinstance(raw_obj, dict):
                        sub = _flatten_fields(raw_obj, prefix=item_prefix)
                        if sub:
                            output.extend(sub)
                            items_added += 1
                    # else: item has no valueObject → skip (not extracted)
                else:
                    val = _extract_simple_value(item)
                    if val is not None:
                        # Only include items where Azure actually extracted a value.
                        output.append(
                            FieldResult(
                                name=item_prefix,
                                value=val,
                                # Use only the item's own confidence — do not
                                # inherit the parent array's confidence.
                                confidence=_safe_confidence(item.get("confidence")),
                            )
                        )
                        items_added += 1
                    # else: skip — Azure matched the region but did not extract
                    #        a typed value (same as portal "(Not found)" per item)
            if items_added == 0:
                # All items had no extractable value → treat the whole array
                # as not found, matching Azure portal's "(Not found)" display.
                output.append(
                    FieldResult(name=full_name, value=None, confidence=confidence)
                )

        elif field_type == "object":
            # Distinguish null (not found) from an empty object.
            raw_obj = (
                field.get("valueObject")
                if "valueObject" in field
                else field.get("value_object")
            )
            if raw_obj is None:
                # valueObject absent or explicitly null → field not found.
                output.append(
                    FieldResult(name=full_name, value=None, confidence=confidence)
                )
                continue
            sub_fields = raw_obj if isinstance(raw_obj, dict) else {}
            if not sub_fields:
                output.append(
                    FieldResult(name=full_name, value=None, confidence=confidence)
                )
                continue
            output.extend(_flatten_fields(sub_fields, prefix=full_name))

        elif field_type == "address":
            addr = field.get("valueAddress") or {}
            output.append(
                FieldResult(
                    name=full_name,
                    value=_format_address(addr),
                    confidence=confidence,
                )
            )

        elif field_type == "currency":
            curr = field.get("valueCurrency") or {}
            amount = curr.get("amount", "")
            symbol = curr.get("currencySymbol", "")
            code = curr.get("currencyCode", "")
            display = f"{symbol}{amount}" if symbol else f"{code} {amount}".strip()
            output.append(FieldResult(name=full_name, value=display or None, confidence=confidence))

        else:
            output.append(
                FieldResult(
                    name=full_name,
                    value=_extract_simple_value(field),
                    confidence=confidence,
                )
            )

    return output


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_VALUE_KEY_MAP: dict[str, str] = {
    "string": "valueString",
    "number": "valueNumber",
    "integer": "valueInteger",
    "date": "valueDate",
    "time": "valueTime",
    "phoneNumber": "valuePhoneNumber",
    "boolean": "valueBoolean",
    "countryRegion": "valueCountryRegion",
    "selectionMark": "valueSelectionMark",
}


def _extract_simple_value(field: dict[str, Any]) -> str | None:
    field_type = field.get("type", "string")
    vkey = _VALUE_KEY_MAP.get(field_type)

    # 1. Try the canonical typed-value key for this field's declared type.
    if vkey and vkey in field:
        val = field[vkey]
        return str(val) if val is not None else None

    # 2. Try any other known typed-value key
    #    (handles minor API-version key-name variations).
    for key in _VALUE_KEY_MAP.values():
        if key in field:
            val = field[key]
            return str(val) if val is not None else None

    # 3. Content fallback — ONLY for completely unrecognised types that are not
    #    in _VALUE_KEY_MAP at all (future/undocumented field types).
    #
    #    For every known type — including "string" — the absence of the
    #    canonical typed-value key (e.g. valueString, valueBoolean, …) means
    #    Azure did NOT successfully extract a value.  The portal shows
    #    "(Not found)" in this case.  field["content"] is raw OCR text scanned
    #    from the document region; surfacing it as the field value causes the
    #    demo to show populated entries for fields that the portal marks as
    #    missing, which is exactly the mismatch the user reported.
    if field_type not in _VALUE_KEY_MAP:
        return field.get("content") or None

    # Known type whose value key is absent → field not found.
    return None


def _format_address(addr: dict[str, Any]) -> str:
    parts = [
        addr.get("streetAddress", ""),
        addr.get("city", ""),
        addr.get("state", ""),
        addr.get("postalCode", ""),
        addr.get("countryRegion", ""),
    ]
    return ", ".join(p for p in parts if p) or None


def _safe_confidence(value: Any) -> float | None:
    try:
        if value is None:
            return None
        v = float(value)
        return round(v, 4)
    except (TypeError, ValueError):
        return None


# ---------------------------------------------------------------------------
# Custom exception
# ---------------------------------------------------------------------------


class AzureCUError(Exception):
    def __init__(self, message: str, detail: str | None = None) -> None:
        super().__init__(message)
        self.detail = detail


# ---------------------------------------------------------------------------
# Analyzer listing / retrieval — shared helpers
# ---------------------------------------------------------------------------


def _normalize_analyzer(analyzer: Any) -> dict[str, Any]:
    """Convert a ContentAnalyzer SDK object to a snake_case dict.

    ``ContentAnalyzer.as_dict()`` uses camelCase REST keys (``"analyzerId"``,
    ``"fieldSchema"``, ``"createdAt"``, etc.).  The router helpers expect
    snake_case keys, so we extract values via Python attribute access.
    ``field_schema`` is the only nested model that matters downstream; its
    own fields (``name``, ``description``, ``fields``) are already lowercase
    in the REST wire format, so ``.as_dict()`` on it is safe.
    """
    if isinstance(analyzer, dict):
        return analyzer  # passthrough — unusual in practice

    field_schema_obj = getattr(analyzer, "field_schema", None)
    field_schema: dict[str, Any] = {}
    if field_schema_obj is not None:
        if hasattr(field_schema_obj, "as_dict"):
            field_schema = field_schema_obj.as_dict()
        elif isinstance(field_schema_obj, dict):
            field_schema = field_schema_obj

    created_at = getattr(analyzer, "created_at", None)
    last_modified_at = getattr(analyzer, "last_modified_at", None)

    # ContentAnalyzerStatus is a StrEnum whose str() gives the long repr
    # ("ContentAnalyzerStatus.READY"); use .value to get the wire string ("ready").
    status_raw = getattr(analyzer, "status", None)
    status_str: str = getattr(status_raw, "value", str(status_raw or ""))

    # Preserve raw tags so the Pro-listing filter can detect CU Studio analyzers
    # (which carry a "templateId" tag) vs Foundry-project analyzers (no tags).
    tags_raw = getattr(analyzer, "tags", None)
    tags: dict[str, str] = dict(tags_raw) if isinstance(tags_raw, dict) else {}

    return {
        "analyzer_id": getattr(analyzer, "analyzer_id", None) or "",
        "description": getattr(analyzer, "description", None) or "",
        "status": status_str,
        "field_schema": field_schema,
        "created_at": str(created_at) if created_at is not None else None,
        "last_modified_at": str(last_modified_at) if last_modified_at is not None else None,
        # Internal metadata — not exposed to the API; used for Pro/Standard filtering only.
        "tags": tags,
    }


def _normalize_rest_analyzer(item: dict[str, Any]) -> dict[str, Any]:
    """Convert a REST API (camelCase) analyzer response to the same snake_case
    shape produced by _normalize_analyzer, so all router helpers work unchanged.

    The Foundry 2025-05-01-preview REST API returns:
      ``analyzerId``, ``fieldSchema``, ``createdAt``, ``lastModifiedAt``.
    """
    tags_raw = item.get("tags") or {}
    tags: dict[str, str] = dict(tags_raw) if isinstance(tags_raw, dict) else {}
    return {
        "analyzer_id": item.get("analyzerId", ""),
        "description": item.get("description") or "",
        "status": (item.get("status") or "").lower(),
        "field_schema": item.get("fieldSchema") or {},
        "created_at": item.get("createdAt"),
        "last_modified_at": item.get("lastModifiedAt"),
        "tags": tags,
    }


# ---------------------------------------------------------------------------
# Pro-mode analyzer listing / retrieval
# These functions use _build_pro_client() and are called exclusively by the
# /pro/analyzers router.  They never touch the Standard-mode analyze flow.
# ---------------------------------------------------------------------------


def _sdk_list_pro_analyzers() -> list[dict[str, Any]]:
    """List Pro (Foundry-project) analyzers via direct REST calls.

    Uses ``PRO_AZURE_CU_API_VERSION`` (``2025-05-01-preview``) because Foundry
    custom-task analyzers live in the preview API namespace and are not returned
    by the GA SDK's ``list_analyzers()`` (which targets ``2025-11-01``).

    Filtering strategy (all env-driven):
    - Always excluded: ``prebuilt-*`` IDs and ``auto-labeling-model-*`` IDs
      (internal Foundry training artifacts).
    - If ``PRO_FOUNDRY_PROJECT_ID`` is set: show ONLY analyzers whose
      ``projectId`` tag matches that value (scopes list to one Foundry project).
    - If not set: show all analyzers with any ``templateId`` tag (catches all
      project-created analyzers across all projects on the resource).

    Follows ``nextLink`` pagination when the result set spans multiple pages.
    """
    endpoint = settings.pro_cu_endpoint
    api_version = settings.pro_cu_api_version
    key = settings.pro_cu_key
    project_id = settings.PRO_FOUNDRY_PROJECT_ID.strip()

    items: list[dict[str, Any]] = []
    url: str | None = (
        f"{endpoint}/contentunderstanding/analyzers?api-version={api_version}"
    )

    while url:
        req = urllib.request.Request(
            url, headers={"Ocp-Apim-Subscription-Key": key}
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                data: dict[str, Any] = _json.loads(resp.read().decode())
        except urllib.error.HTTPError as exc:
            raise AzureCUError(
                f"Azure CU list_analyzers failed (HTTP {exc.code}): {exc.reason}",
                detail=str(exc),
            ) from exc

        for item in data.get("value") or []:
            normalized = _normalize_rest_analyzer(item)
            aid = normalized.get("analyzer_id", "")

            # Exclude Azure-managed prebuilt analyzers.
            if aid.startswith("prebuilt-"):
                continue
            # Exclude internal Foundry auto-labeling training models.
            if aid.startswith("auto-labeling-model-"):
                continue

            tags: dict = normalized.get("tags") or {}
            if project_id:
                # Strict: only show analyzers that belong to this Foundry project.
                if tags.get("projectId") != project_id:
                    continue
            else:
                # Fallback: show all project-created analyzers (those with a
                # templateId tag). Prebuilt and auto-labeling models (no tags)
                # are already excluded above.
                if not tags.get("templateId"):
                    continue

            items.append(normalized)

        url = data.get("nextLink")  # follow pagination when present

    return items


def _sdk_get_pro_analyzer(analyzer_id: str) -> dict[str, Any]:
    """Fetch a single Pro analyzer by ID via REST."""
    endpoint = settings.pro_cu_endpoint
    api_version = settings.pro_cu_api_version
    key = settings.pro_cu_key

    url = (
        f"{endpoint}/contentunderstanding/analyzers/"
        f"{_url_quote(analyzer_id, safe='')}?api-version={api_version}"
    )
    req = urllib.request.Request(url, headers={"Ocp-Apim-Subscription-Key": key})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data: dict[str, Any] = _json.loads(resp.read().decode())
    except urllib.error.HTTPError as exc:
        raise AzureCUError(
            f"Azure CU get_analyzer({analyzer_id!r}) failed (HTTP {exc.code}): {exc.reason}",
            detail=str(exc),
        ) from exc

    return _normalize_rest_analyzer(data)


async def list_pro_analyzers() -> list[dict[str, Any]]:
    """Async wrapper: list Foundry-project analyzers from the Pro CU resource."""
    try:
        return await asyncio.to_thread(_sdk_list_pro_analyzers)
    except AzureCUError:
        raise
    except Exception as exc:
        raise AzureCUError(str(exc)) from exc


async def get_pro_analyzer(analyzer_id: str) -> dict[str, Any]:
    """Async wrapper: fetch a single Pro analyzer by ID."""
    try:
        return await asyncio.to_thread(_sdk_get_pro_analyzer, analyzer_id)
    except AzureCUError:
        raise
    except Exception as exc:
        raise AzureCUError(str(exc)) from exc


# ---------------------------------------------------------------------------
# Pro analyzer create / update (PUT with LRO)
# ---------------------------------------------------------------------------


def _rest_put_analyzer(
    analyzer_id: str,
    description: str,
    schema_name: str,
    schema_description: str,
    fields: list[dict[str, str]],
) -> dict[str, Any]:
    """Create or update a Pro analyzer via PUT REST (2025-05-01-preview).

    ``fields`` is a list of dicts with keys: name, type, description, method.
    Returns a normalised analyzer dict once the LRO has completed.
    """
    endpoint = settings.pro_cu_endpoint
    api_version = settings.pro_cu_api_version
    key = settings.pro_cu_key

    # Azure CU field names must match ^[a-zA-Z][a-zA-Z0-9_]*$ (no spaces or
    # special characters). Sanitize each field name before sending.
    def _sanitize_field_name(raw: str) -> str:
        s = re.sub(r"[^a-zA-Z0-9_]", "_", raw.strip())
        if not s:
            return "field"
        if not s[0].isalpha():
            s = "f_" + s
        return s

    # Azure CU expects fields as a dict keyed by field name.
    fields_dict: dict[str, dict] = {}
    for f in fields:
        safe_name = _sanitize_field_name(f["name"])
        field_type = f.get("type", "string")
        entry: dict = {
            "type": field_type,
            "description": f.get("description", ""),
            "method": f.get("method", "extract"),
        }
        # Azure CU requires the `items` property for array-typed fields.
        # Use the preserved definition from the GET response; fall back to
        # {"type": "string"} for new fields created in the UI.
        if field_type == "array":
            entry["items"] = f.get("items_def") or {"type": "string"}
        fields_dict[safe_name] = entry

    url = (
        f"{endpoint}/contentunderstanding/analyzers/"
        f"{_url_quote(analyzer_id, safe='')}?api-version={api_version}"
    )

    body: dict[str, Any] = {
        "description": description,
        "baseAnalyzerId": "prebuilt-documentAnalyzer",
        "fieldSchema": {
            "fields": fields_dict,
        },
    }

    # Include Foundry project tag so the analyzer appears in the project.
    project_id: str = settings.PRO_FOUNDRY_PROJECT_ID.strip()
    if project_id:
        body["tags"] = {"projectId": project_id}

    logger.info(
        "[CU-PRO] PUT analyzer | id=%s | fields=%d",
        analyzer_id,
        len(fields_dict),
    )

    def _do_put() -> tuple[str, str]:
        """Execute the PUT and return (operation_location, raw_body)."""
        _req = urllib.request.Request(
            url,
            data=_json.dumps(body).encode("utf-8"),
            headers={
                "Ocp-Apim-Subscription-Key": key,
                "Content-Type": "application/json",
            },
            method="PUT",
        )
        with urllib.request.urlopen(_req, timeout=60) as _resp:
            return _resp.headers.get("operation-location", ""), _resp.read().decode("utf-8")

    try:
        operation_location, raw_body = _do_put()
    except urllib.error.HTTPError as exc:
        body_text = exc.read().decode("utf-8", errors="replace")
        if exc.code == 409:
            # Azure CU PUT is create-only — 409 means the analyzer already
            # exists.  Delete it, wait for propagation, then recreate.
            logger.info(
                "[CU-PRO] PUT 409 ModelExists — deleting then recreating | id=%s",
                analyzer_id,
            )
            _rest_delete_analyzer(analyzer_id)
            time.sleep(4)  # Wait for deletion to propagate through Azure
            try:
                operation_location, raw_body = _do_put()
            except urllib.error.HTTPError as exc2:
                body_text2 = exc2.read().decode("utf-8", errors="replace")
                logger.error(
                    "[CU-PRO] PUT failed after delete+recreate (HTTP %d): %s",
                    exc2.code, body_text2,
                )
                raise AzureCUError(
                    f"Azure CU PUT analyzer failed after delete+recreate (HTTP {exc2.code}): {exc2.reason}",
                    detail=body_text2,
                ) from exc2
        else:
            logger.error("[CU-PRO] PUT analyzer failed (HTTP %d): %s", exc.code, body_text)
            raise AzureCUError(
                f"Azure CU PUT analyzer failed (HTTP {exc.code}): {exc.reason}",
                detail=body_text,
            ) from exc

    if not operation_location:
        # Immediate completion (HTTP 200) – parse body directly.
        try:
            data = _json.loads(raw_body)
            return _normalize_rest_analyzer(data)
        except Exception:
            return _sdk_get_pro_analyzer(analyzer_id)

    # Poll LRO until succeeded / failed (Azure CU builds can take ~minutes).
    timeout_secs = 300.0
    poll_interval = 3.0
    start_poll = time.perf_counter()
    poll_headers = {"Ocp-Apim-Subscription-Key": key}

    while True:
        elapsed = time.perf_counter() - start_poll
        if elapsed > timeout_secs:
            raise AzureCUError(
                f"PUT analyzer '{analyzer_id}' timed out after {int(timeout_secs)}s."
            )

        time.sleep(poll_interval)

        poll_req = urllib.request.Request(operation_location, headers=poll_headers)
        try:
            with urllib.request.urlopen(poll_req, timeout=30) as resp:
                result: dict[str, Any] = _json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            err_body = exc.read().decode("utf-8", errors="replace")
            raise AzureCUError(
                f"PUT analyzer poll failed (HTTP {exc.code}): {exc.reason}",
                detail=err_body,
            ) from exc

        status_val = (result.get("status") or "").lower()
        if status_val == "succeeded":
            logger.info("[CU-PRO] PUT analyzer succeeded | id=%s", analyzer_id)
            return _sdk_get_pro_analyzer(analyzer_id)
        if status_val in ("failed", "cancelled", "canceled"):
            error_detail = result.get("error") or result.get("errors") or {}
            raise AzureCUError(
                f"PUT analyzer {status_val} for '{analyzer_id}'.",
                detail=_json.dumps(error_detail),
            )
        # Still running – keep polling.


async def save_pro_analyzer(
    analyzer_id: str,
    description: str,
    schema_name: str,
    schema_description: str,
    fields: list[dict[str, str]],
) -> dict[str, Any]:
    """Async wrapper: create or update a Pro analyzer via PUT REST."""
    try:
        return await asyncio.to_thread(
            _rest_put_analyzer,
            analyzer_id,
            description,
            schema_name,
            schema_description,
            fields,
        )
    except AzureCUError:
        raise
    except Exception as exc:
        raise AzureCUError(str(exc)) from exc


# ---------------------------------------------------------------------------
# Pro analyzer delete (DELETE)
# ---------------------------------------------------------------------------


def _rest_delete_analyzer(analyzer_id: str) -> None:
    """Delete a Pro analyzer via DELETE REST (2025-05-01-preview).

    Returns None on success (204 No Content).  Raises AzureCUError on failure.
    """
    endpoint = settings.pro_cu_endpoint
    api_version = settings.pro_cu_api_version
    key = settings.pro_cu_key

    url = (
        f"{endpoint}/contentunderstanding/analyzers/"
        f"{_url_quote(analyzer_id, safe='')}?api-version={api_version}"
    )

    req = urllib.request.Request(
        url,
        headers={"Ocp-Apim-Subscription-Key": key},
        method="DELETE",
    )

    try:
        with urllib.request.urlopen(req, timeout=30):
            pass  # 204 No Content — nothing to parse
    except urllib.error.HTTPError as exc:
        body_text = exc.read().decode("utf-8", errors="replace")
        logger.error("[CU-PRO] DELETE analyzer failed (HTTP %d): %s", exc.code, body_text)
        raise AzureCUError(
            f"Azure CU DELETE analyzer failed (HTTP {exc.code}): {exc.reason}",
            detail=body_text,
        ) from exc

    logger.info("[CU-PRO] DELETE analyzer succeeded | id=%s", analyzer_id)


async def delete_pro_analyzer(analyzer_id: str) -> None:
    """Async wrapper: delete a Pro analyzer via DELETE REST."""
    try:
        await asyncio.to_thread(_rest_delete_analyzer, analyzer_id)
    except AzureCUError:
        raise
    except Exception as exc:
        raise AzureCUError(str(exc)) from exc
