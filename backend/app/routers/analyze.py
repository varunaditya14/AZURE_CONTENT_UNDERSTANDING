"""
Standard-mode analyze router — POST /standard/analyze

Accepts a multipart file upload, detects the modality (document, image,
audio, or video), routes it to the appropriate Azure Content Understanding
analyzer configured in .env, and returns a structured AnalyzeResponse.

This router is exclusively for Standard mode.  It never touches Pro analyzers.

To add a new format: add an entry to _ROUTING_TABLE and _EXTENSION_FALLBACK.
_SUPPORTED_DISPLAY, _ENV_KEY_MAP are derived automatically — no manual update.
"""

from __future__ import annotations

import logging
import statistics

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from fastapi.responses import JSONResponse

from app.config import settings
from app.models.schemas import AnalyzeResponse, ErrorDetail, FieldResult
from app.services.azure_cu import AzureCUError, analyze_file, extract_fields

router = APIRouter(prefix="/standard/analyze", tags=["standard"])

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# File type → (canonical label, MIME type sent to Azure, analyzer_id)
# This is the single source of truth for accepted formats.
# _SUPPORTED_DISPLAY and _ENV_KEY_MAP derive from these tables automatically.
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
    # Audio
    "audio/mpeg": ("audio", "audio/mpeg", settings.ANALYZER_ID_AUDIO),
    "audio/mp4": ("audio", "audio/mp4", settings.ANALYZER_ID_AUDIO),
    "audio/wav": ("audio", "audio/wav", settings.ANALYZER_ID_AUDIO),
    "audio/x-wav": ("audio", "audio/wav", settings.ANALYZER_ID_AUDIO),
    "audio/ogg": ("audio", "audio/ogg", settings.ANALYZER_ID_AUDIO),
    "audio/flac": ("audio", "audio/flac", settings.ANALYZER_ID_AUDIO),
    "audio/aac": ("audio", "audio/aac", settings.ANALYZER_ID_AUDIO),
    "audio/x-aac": ("audio", "audio/aac", settings.ANALYZER_ID_AUDIO),
    "audio/webm": ("audio", "audio/webm", settings.ANALYZER_ID_AUDIO),
    "audio/x-m4a": ("audio", "audio/mp4", settings.ANALYZER_ID_AUDIO),
    # Video
    "video/mp4": ("video", "video/mp4", settings.ANALYZER_ID_VIDEO),
    "video/mpeg": ("video", "video/mpeg", settings.ANALYZER_ID_VIDEO),
    "video/quicktime": ("video", "video/quicktime", settings.ANALYZER_ID_VIDEO),
    "video/webm": ("video", "video/webm", settings.ANALYZER_ID_VIDEO),
    "video/x-msvideo": ("video", "video/x-msvideo", settings.ANALYZER_ID_VIDEO),
    "video/x-matroska": ("video", "video/x-matroska", settings.ANALYZER_ID_VIDEO),
}

# Extension fallback when the client sends an unhelpful MIME type.
# IMPORTANT: list the canonical/preferred extension for each MIME type FIRST
# (e.g. ".jpeg" before ".jpg") — the first entry per MIME becomes the
# display name in error messages via _build_supported_display().
_EXTENSION_FALLBACK: dict[str, str] = {
    ".pdf": "application/pdf",
    ".jpeg": "image/jpeg",   # canonical — display shows "JPEG"
    ".jpg": "image/jpeg",
    ".png": "image/png",
    ".tiff": "image/tiff",   # canonical — display shows "TIFF"
    ".tif": "image/tiff",
    ".bmp": "image/bmp",
    ".heif": "image/heif",   # canonical — display shows "HEIF"
    ".heic": "image/heif",
    ".webp": "image/webp",
    # Audio
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".flac": "audio/flac",
    ".aac": "audio/aac",
    ".m4a": "audio/x-m4a",
    # Video
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".avi": "video/x-msvideo",
    ".mkv": "video/x-matroska",
    ".webm": "video/webm",
}

# Display-name overrides for extensions where ext.upper() gives wrong casing.
_EXT_DISPLAY_OVERRIDE: dict[str, str] = {
    "webp": "WebP",
    "webm": "WebM",
}

# Maps file_type label → env var name. Used in the "not configured" error.
# Derived from the canonical labels in _ROUTING_TABLE.
_ENV_KEY_MAP: dict[str, str] = {
    "pdf": "ANALYZER_ID_DOCUMENT",
    "image": "ANALYZER_ID_IMAGE",
    "audio": "ANALYZER_ID_AUDIO",
    "video": "ANALYZER_ID_VIDEO",
}


def _build_supported_display() -> str:
    """
    Compute the human-readable supported-types string from _EXTENSION_FALLBACK
    and _ROUTING_TABLE so it never drifts when formats are added or removed.

    The first extension listed per MIME in _EXTENSION_FALLBACK becomes the
    display name for that MIME (e.g. ".jpeg" → "JPEG", ".tiff" → "TIFF").
    _EXT_DISPLAY_OVERRIDE handles mixed-case names ("webp" → "WebP").
    """
    seen: set[str] = set()
    groups: dict[str, list[str]] = {"pdf": [], "image": [], "audio": [], "video": []}
    for ext, mime in _EXTENSION_FALLBACK.items():
        if mime in seen or mime not in _ROUTING_TABLE:
            continue
        seen.add(mime)
        label = _ROUTING_TABLE[mime][0]
        if label in groups:
            raw = ext.lstrip(".")
            groups[label].append(_EXT_DISPLAY_OVERRIDE.get(raw, raw.upper()))
    return "; ".join(
        ", ".join(groups[lbl]) for lbl in ("pdf", "image", "audio", "video") if groups[lbl]
    )


_SUPPORTED_DISPLAY = _build_supported_display()


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
    summary="Analyze a document, image, audio, or video file",
)
async def analyze(
    file: UploadFile = File(..., description="File to analyze (document, image, audio, or video)"),
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
        analyzer_id or "(not configured)",
    )

    # ── Guard: fail fast if analyzer_id is not configured ───────────────────
    if not analyzer_id.strip():
        env_key = _ENV_KEY_MAP.get(file_type_label, "ANALYZER_ID_*")
        logger.error(
            "[ROUTE] Analyzer ID not configured for file_type=%s — set %s in .env",
            file_type_label,
            env_key,
        )
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=ErrorDetail(
                error="Analyzer not configured",
                detail=(
                    f"No analyzer ID is set for '{file_type_label}' files. "
                    f"Add {env_key}=<your-analyzer-id> to your .env file and restart the server."
                ),
            ).model_dump(),
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
    logger.info(
        "[ROUTE] Submitting to Azure | analyzer_id=%s | file_type=%s | azure_content_type=%s | size_bytes=%d",
        analyzer_id,
        file_type_label,
        azure_content_type,
        len(file_bytes),
    )
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
        file_names=[file_name],
        file_type=file_type_label,
        analyzer_id=analyzer_id,
        latency_ms=latency_ms,
        field_count=len(fields),
        average_confidence=average_confidence,
        fields=fields,
        raw_result=raw_result,
    )
