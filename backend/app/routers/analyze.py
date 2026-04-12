"""
Analyze router — POST /analyze

Accepts a multipart file upload, detects whether it is a PDF or image,
routes it to the appropriate Azure Content Understanding analyzer, and
returns a structured AnalyzeResponse.

To extend for audio/video: add entries to SUPPORTED_TYPES and
MEDIA_TYPE_TO_ANALYZER below, then update the rejection message.
"""

from __future__ import annotations

import logging
import statistics

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from fastapi.responses import JSONResponse

from app.config import settings
from app.models.schemas import AnalyzeResponse, ErrorDetail, FieldResult
from app.services.azure_cu import AzureCUError, analyze_file, extract_fields

router = APIRouter(prefix="/analyze", tags=["analyze"])

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# File type → (canonical label, MIME type sent to Azure, analyzer env var)
# ---------------------------------------------------------------------------

# Each entry: (canonical_file_type, azure_content_type, analyzer_id)
_ROUTING_TABLE: dict[str, tuple[str, str, str]] = {
    # MIME type key → (label, azure content-type, analyzer_id)
    "application/pdf": ("pdf", "application/pdf", settings.ANALYZER_ID_DOCUMENT),
    "image/jpeg": ("image", "image/jpeg", settings.ANALYZER_ID_IMAGE),
    "image/jpg": ("image", "image/jpeg", settings.ANALYZER_ID_IMAGE),
    "image/png": ("image", "image/png", settings.ANALYZER_ID_IMAGE),
    "image/tiff": ("image", "image/tiff", settings.ANALYZER_ID_IMAGE),
    "image/bmp": ("image", "image/bmp", settings.ANALYZER_ID_IMAGE),
    "image/heif": ("image", "image/heif", settings.ANALYZER_ID_IMAGE),
    "image/webp": ("image", "image/webp", settings.ANALYZER_ID_IMAGE),
}

# Extension fallback when the client sends an unhelpful MIME type
_EXTENSION_FALLBACK: dict[str, str] = {
    ".pdf": "application/pdf",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".tiff": "image/tiff",
    ".tif": "image/tiff",
    ".bmp": "image/bmp",
    ".heif": "image/heif",
    ".heic": "image/heif",
    ".webp": "image/webp",
}

_SUPPORTED_DISPLAY = "PDF, JPEG, PNG, TIFF, BMP, HEIF, WebP"


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------


@router.post(
    "",
    response_model=AnalyzeResponse,
    responses={
        400: {"model": ErrorDetail, "description": "Unsupported file type"},
        422: {"model": ErrorDetail, "description": "Validation error"},
        502: {"model": ErrorDetail, "description": "Azure CU error"},
    },
    summary="Analyze a PDF or image file",
)
async def analyze(
    file: UploadFile = File(..., description="PDF or image file to analyze"),
) -> AnalyzeResponse:
    # ── Resolve MIME type ────────────────────────────────────────────────────
    declared_mime = (file.content_type or "").lower().split(";")[0].strip()
    resolved_mime = declared_mime
    filename = file.filename or "upload"
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    logger.info(
        "[ROUTE] Incoming upload | filename=%s | declared_mime=%s | ext=%s",
        filename,
        declared_mime or "(none)",
        ext or "(none)",
    )

    if resolved_mime not in _ROUTING_TABLE:
        # Try extension fallback
        resolved_mime = _EXTENSION_FALLBACK.get(ext, resolved_mime)

    if resolved_mime not in _ROUTING_TABLE:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ErrorDetail(
                error="Unsupported file type",
                detail=(
                    f"Received '{declared_mime or 'unknown'}'. "
                    f"Supported types: {_SUPPORTED_DISPLAY}."
                ),
            ).model_dump(),
        )

    file_type_label, azure_content_type, analyzer_id = _ROUTING_TABLE[resolved_mime]
    file_name = filename

    logger.info(
        "[ROUTE] Routed | resolved_mime=%s | file_type=%s | analyzer_id=%s",
        resolved_mime,
        file_type_label,
        analyzer_id,
    )

    # ── Read file bytes (single read — bytes are reused below) ──────────────
    try:
        file_bytes = await file.read()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Could not read uploaded file: {exc}",
        ) from exc

    logger.info(
        "[ROUTE] File read | filename=%s | size_bytes=%d",  # byte length logged here
        file_name,
        len(file_bytes),
    )

    if not file_bytes:
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content=ErrorDetail(error="Empty file", detail="The uploaded file has no content.").model_dump(),
        )

    # ── Call Azure Content Understanding ────────────────────────────────────
    try:
        raw_result, latency_ms = await analyze_file(
            file_bytes=file_bytes,
            content_type=azure_content_type,
            analyzer_id=analyzer_id,
            filename=file_name,
        )
    except AzureCUError as exc:
        return JSONResponse(
            status_code=status.HTTP_502_BAD_GATEWAY,
            content=ErrorDetail(
                error=str(exc),
                detail=exc.detail,
            ).model_dump(),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Unexpected error calling Azure Content Understanding: {exc}",
        ) from exc

    # ── Extract & summarise fields ───────────────────────────────────────────
    fields: list[FieldResult] = extract_fields(raw_result)
    confidences = [f.confidence for f in fields if f.confidence is not None]
    average_confidence = round(statistics.mean(confidences), 4) if confidences else None

    return AnalyzeResponse(
        success=True,
        file_name=file_name,
        file_type=file_type_label,
        analyzer_id=analyzer_id,
        latency_ms=latency_ms,
        field_count=len(fields),
        average_confidence=average_confidence,
        fields=fields,
        raw_result=raw_result,
    )
