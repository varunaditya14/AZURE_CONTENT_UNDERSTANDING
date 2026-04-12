"""
Azure Content Understanding service wrapper — SDK edition.

Uses ContentUnderstandingClient (azure-ai-contentunderstanding) with
AzureKeyCredential.  The SDK handles LRO polling internally; we bridge
the synchronous SDK call into the async FastAPI event loop via
asyncio.to_thread().

Designed to support additional modalities (audio, video) by adding new
callers of `analyze_file` with appropriate content types.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

from azure.ai.contentunderstanding import ContentUnderstandingClient
from azure.ai.contentunderstanding.models import AnalysisInput
from azure.core.credentials import AzureKeyCredential
from azure.core.exceptions import HttpResponseError

from app.config import settings
from app.models.schemas import FieldResult

logger = logging.getLogger(__name__)

# API version required by the user — set here as a service constant, not a secret.
_SDK_API_VERSION = "2025-11-01"


# ---------------------------------------------------------------------------
# SDK client factory
# ---------------------------------------------------------------------------


def _build_client() -> ContentUnderstandingClient:
    return ContentUnderstandingClient(
        endpoint=settings.AZURE_CU_ENDPOINT,
        credential=AzureKeyCredential(settings.AZURE_CU_KEY),
        api_version=_SDK_API_VERSION,
    )


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
# Field extraction & flattening
# ---------------------------------------------------------------------------


def extract_fields(result: dict[str, Any]) -> list[FieldResult]:
    """
    Locate the ``fields`` dict inside the Azure CU result payload and
    return a flat list of `FieldResult` objects suitable for the frontend.

    Handles both result structures:
    - ``result.contents[].fields``   (standard async response)
    - ``result.documents[].fields``  (preview/alternative layout)
    """
    raw_fields: dict[str, Any] = {}

    for container_key in ("contents", "documents"):
        container = result.get(container_key)
        if isinstance(container, list) and container:
            raw_fields = container[0].get("fields", {})
            break

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
            items: list[dict] = field.get("valueArray") or []
            if not items:
                output.append(
                    FieldResult(name=full_name, value="[]", confidence=confidence)
                )
                continue
            # Limit to first 50 items to avoid enormous payloads
            for idx, item in enumerate(items[:50]):
                item_prefix = f"{full_name}[{idx}]"
                if item.get("type") == "object":
                    sub_fields = item.get("valueObject") or {}
                    output.extend(_flatten_fields(sub_fields, prefix=item_prefix))
                else:
                    output.append(
                        FieldResult(
                            name=item_prefix,
                            value=_extract_simple_value(item),
                            confidence=_safe_confidence(item.get("confidence", confidence)),
                        )
                    )

        elif field_type == "object":
            sub_fields = field.get("valueObject") or {}
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
    if vkey and vkey in field:
        return str(field[vkey])
    # Fallback order: any known value key, then "content"
    for key in _VALUE_KEY_MAP.values():
        if key in field:
            return str(field[key])
    return field.get("content") or None


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
