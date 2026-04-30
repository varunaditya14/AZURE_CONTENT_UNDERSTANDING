"""
Pro-mode analyze router — POST /pro/analyze

Accepts multiple test files plus optional reference files together with an
``analyzer_id`` form field.  All files are forwarded as base64 inputs to the
Azure Content Understanding ``2025-05-01-preview`` REST endpoint so that the
Foundry custom-task analyzer can reason across the entire document set.

Test files are included first, followed by reference files.  The Azure CU
analyzer's own schema defines how it uses each document; there is no
separate "reference" concept at the REST API level.

This router never touches Standard-mode endpoints or the Standard client.
Create / edit / delete analyzer operations are out of scope here.
"""

from __future__ import annotations

import logging
import mimetypes
import statistics
from typing import List

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from fastapi.responses import JSONResponse

from app.models.schemas import AnalyzeResponse, ErrorDetail, FieldResult
from app.services.azure_cu import AzureCUError, extract_fields, pro_analyze_file
from app.routers.test_file_sets import SETS_DIR as TEST_SETS_DIR, _detect_kind, _load_index as _load_test_index
from app.routers.reference_file_sets import SETS_DIR as REF_SETS_DIR, _load_index as _load_ref_index

router = APIRouter(prefix="/pro", tags=["pro"])
logger = logging.getLogger(__name__)


def _resolve_content_type(declared: str, filename: str) -> str:
    """Return the best available MIME type for the file.

    Falls back to a ``mimetypes`` guess from the filename extension when the
    browser sends ``application/octet-stream`` or an empty string.
    """
    ct = (declared or "").lower().split(";")[0].strip()
    if ct and ct != "application/octet-stream":
        return ct
    guessed, _ = mimetypes.guess_type(filename)
    return guessed or "application/octet-stream"


def _file_type_label(content_type: str, filename: str) -> str:
    """Derive a short file-type label from the resolved MIME / extension."""
    if content_type.startswith("image/"):
        return "image"
    if content_type.startswith("audio/"):
        return "audio"
    if content_type.startswith("video/"):
        return "video"
    if content_type == "application/pdf":
        return "pdf"
    if "." in filename:
        return filename.rsplit(".", 1)[-1].lower()
    return "file"


@router.post(
    "/analyze",
    response_model=AnalyzeResponse,
    responses={
        400: {"model": ErrorDetail, "description": "Missing or empty input"},
        502: {"model": ErrorDetail, "description": "Azure CU error"},
    },
    summary="Run a Pro (Foundry) analyzer on one or more uploaded files",
)
async def pro_analyze(
    test_files: List[UploadFile] = File(default=[], description="One or more test files to analyze"),
    reference_files: List[UploadFile] = File(default=[], description="Optional reference/context files"),
    analyzer_id: str = Form(..., description="Pro analyzer ID to use"),
    saved_test_file_set_id: str = Form(
        default="",
        description="ID of a saved test file set to use instead of uploading files",
    ),
    saved_reference_file_set_id: str = Form(
        default="",
        description="ID of a saved reference file set to use instead of uploading reference files",
    ),
) -> AnalyzeResponse:
    if not analyzer_id.strip():
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ErrorDetail(
                error="analyzer_id is required",
                detail="Pass the Pro analyzer ID as a form field named 'analyzer_id'.",
            ).model_dump(),
        )

    # Validate that at least one source of test files was provided.
    if not test_files and not saved_test_file_set_id.strip():
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ErrorDetail(
                error="At least one test file is required",
                detail="Either upload files via 'test_files' or provide a 'saved_test_file_set_id'.",
            ).model_dump(),
        )

    logger.info(
        "[PRO-ROUTE] Incoming | test_files=%d | reference_files=%d | analyzer_id=%s | saved_set=%s | saved_ref_set=%s",
        len(test_files),
        len(reference_files),
        analyzer_id,
        saved_test_file_set_id or "(none)",
        saved_reference_file_set_id or "(none)",
    )

    # ── Read all file bytes ────────────────────────────────────────────────

    async def _read_upload(upload: UploadFile) -> tuple[bytes, str, str]:
        fname = upload.filename or "upload"
        try:
            data = await upload.read()
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Could not read file '{fname}': {exc}",
            ) from exc
        if not data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File '{fname}' is empty.",
            )
        ct = _resolve_content_type(upload.content_type or "", fname)
        return data, ct, fname

    # Test files first, then reference files — order is preserved.
    inputs: list[tuple[bytes, str, str]] = []
    all_filenames: list[str] = []

    if test_files:
        # Freshly uploaded blobs (takes priority over saved set).
        for uf in test_files:
            data, ct, fname = await _read_upload(uf)
            inputs.append((data, ct, fname))
            all_filenames.append(fname)
    elif saved_test_file_set_id.strip():
        # Load test files from the persisted set on disk.
        sets = _load_test_index()
        record = next((s for s in sets if s["id"] == saved_test_file_set_id), None)
        if not record:
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ErrorDetail(
                    error=f"Saved test file set '{saved_test_file_set_id}' not found.",
                    detail="Save the test file set first, then run analysis.",
                ).model_dump(),
            )
        set_dir = TEST_SETS_DIR / saved_test_file_set_id
        for fi in record.get("files", []):
            matches = list(set_dir.glob(f"{fi['id']}_*")) if set_dir.exists() else []
            if matches:
                data = matches[0].read_bytes()
                ct = _detect_kind("", fi["name"])
                inputs.append((data, ct, fi["name"]))
                all_filenames.append(fi["name"])
        if not inputs:
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content=ErrorDetail(
                    error="Saved test file set has no files.",
                    detail="Add files to the set and save before running analysis.",
                ).model_dump(),
            )

    if reference_files:
        # Freshly uploaded reference blobs (takes priority over saved ref set).
        for uf in reference_files:
            data, ct, fname = await _read_upload(uf)
            inputs.append((data, ct, fname))
            all_filenames.append(fname)
    elif saved_reference_file_set_id.strip():
        # Load reference files from the persisted set on disk.
        ref_sets = _load_ref_index()
        ref_record = next((s for s in ref_sets if s["id"] == saved_reference_file_set_id), None)
        if ref_record:
            ref_set_dir = REF_SETS_DIR / saved_reference_file_set_id
            for fi in ref_record.get("files", []):
                matches = list(ref_set_dir.glob(f"{fi['id']}_*")) if ref_set_dir.exists() else []
                if matches:
                    data = matches[0].read_bytes()
                    ct = _detect_kind("", fi["name"])
                    inputs.append((data, ct, fi["name"]))
                    all_filenames.append(fi["name"])

    # ── Call the Pro REST analyze ──────────────────────────────────────────

    try:
        raw_result, latency_ms = await pro_analyze_file(
            inputs=inputs,
            analyzer_id=analyzer_id,
        )
    except AzureCUError as exc:
        logger.error("[PRO-ROUTE] Azure CU error: %s", exc)
        return JSONResponse(
            status_code=status.HTTP_502_BAD_GATEWAY,
            content=ErrorDetail(
                error=str(exc),
                detail=exc.detail,
            ).model_dump(),
        )
    except Exception as exc:
        logger.exception("[PRO-ROUTE] Unexpected error")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Unexpected error calling Azure Content Understanding: {exc}",
        ) from exc

    fields: list[FieldResult] = extract_fields(raw_result)
    confidences = [f.confidence for f in fields if f.confidence is not None]
    average_confidence = round(statistics.mean(confidences), 4) if confidences else None

    # Primary file label: first test file name + type
    primary_name = all_filenames[0] if all_filenames else "upload"
    primary_ct = inputs[0][1] if inputs else "application/octet-stream"

    return AnalyzeResponse(
        success=True,
        file_name=primary_name,
        file_names=all_filenames,
        file_type=_file_type_label(primary_ct, primary_name),
        analyzer_id=analyzer_id,
        latency_ms=latency_ms,
        field_count=len(fields),
        average_confidence=average_confidence,
        fields=fields,
        raw_result=raw_result,
    )

