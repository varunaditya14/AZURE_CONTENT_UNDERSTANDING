"""
Pro-mode analyzers router — GET /pro/analyzers and GET /pro/analyzers/{analyzer_id}

Lists only Pro (custom/Foundry-created) analyzers from the configured Pro Azure CU
resource and returns the full field schema for a single Pro analyzer.

What is excluded from the Pro list
-----------------------------------
1. Microsoft prebuilt analyzers (IDs starting with "prebuilt-") — excluded by
   the service layer (_sdk_list_pro_analyzers).
2. Standard-mode analyzers — the analyzer IDs configured in .env as
   ANALYZER_ID_DOCUMENT / ANALYZER_ID_IMAGE / ANALYZER_ID_AUDIO / ANALYZER_ID_VIDEO
   are excluded by _is_pro_analyzer() below, so the two analyzer pools never overlap
   even when Standard and Pro share the same Azure CU resource.

This router never touches the Standard analyze flow (POST /standard/analyze).
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, status

from app.config import settings
from app.models.schemas import (
    AnalyzerDetail,
    AnalyzerFieldItem,
    AnalyzerListItem,
    AnalyzerSaveRequest,
    ErrorDetail,
)
from app.services.azure_cu import (
    AzureCUError,
    delete_pro_analyzer,
    get_pro_analyzer,
    list_pro_analyzers,
    save_pro_analyzer,
)

router = APIRouter(prefix="/pro/analyzers", tags=["pro"])
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Pool boundary — separates Pro analyzers from Standard-mode ones
# ---------------------------------------------------------------------------

def _is_pro_analyzer(analyzer_id: str) -> bool:
    """Return True only if analyzer_id belongs to the Pro analyzer pool.

    Exclusion rules (all env-driven, no hardcoded IDs):
    - Empty string          → excluded (shouldn't happen, but guard anyway)
    - "prebuilt-*" prefix   → excluded (already filtered by service, double-guard here)
    - Any ANALYZER_ID_*     → excluded (these are the Standard-mode analyzer IDs)
    """
    if not analyzer_id:
        return False
    if analyzer_id.startswith("prebuilt-"):
        return False
    if analyzer_id in settings.standard_analyzer_ids:
        return False
    return True


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------


def _extract_fields(field_schema: dict) -> list[dict]:
    """Parse field_schema.fields into a flat list of normalised field dicts."""
    fields_raw: dict = field_schema.get("fields") or {}
    result = []
    for name, defn in fields_raw.items():
        if not isinstance(defn, dict):
            continue
        field_type = (defn.get("type") or "string").lower()
        entry: dict = {
            "name": name,
            "description": defn.get("description") or "",
            "type": field_type,
            "method": (defn.get("method") or "extract").lower(),
        }
        # Preserve the raw `items` definition for array fields so that the
        # schema can be round-tripped back to Azure without losing the item type.
        if field_type == "array" and isinstance(defn.get("items"), dict):
            entry["items"] = defn["items"]
        result.append(entry)
    return result


def _to_list_item(raw: dict) -> AnalyzerListItem:
    """Map a raw ContentAnalyzer dict to an AnalyzerListItem."""
    field_schema: dict = raw.get("field_schema") or {}
    fields_raw: dict = field_schema.get("fields") or {}

    # Azure CU does not persist a fieldSchema.name — the analyzer_id is the
    # stable identifier.  Use it directly as the display name.
    analyzer_id: str = raw.get("analyzer_id") or ""

    created_at = raw.get("created_at")
    last_modified_at = raw.get("last_modified_at")

    return AnalyzerListItem(
        id=analyzer_id,
        name=analyzer_id,
        description=raw.get("description") or "",
        status=str(raw.get("status", "")).lower() or None,
        field_count=len(fields_raw),
        created_at=str(created_at) if created_at else None,
        last_modified_at=str(last_modified_at) if last_modified_at else None,
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get(
    "",
    response_model=list[AnalyzerListItem],
    summary="List Pro (custom/Foundry-created) analyzers",
)
async def list_pro_analyzers_endpoint() -> list[AnalyzerListItem]:
    """Return only Pro analyzers — never Standard-mode or prebuilt analyzers."""
    try:
        raw_list = await list_pro_analyzers()
        return [
            _to_list_item(a)
            for a in raw_list
            if _is_pro_analyzer(a.get("analyzer_id", ""))
        ]
    except AzureCUError as exc:
        logger.error("[PRO/ANALYZERS] list failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        )


@router.get(
    "/{analyzer_id}",
    response_model=AnalyzerDetail,
    summary="Get a single Pro analyzer with its full field schema",
)
async def get_pro_analyzer_endpoint(analyzer_id: str) -> AnalyzerDetail:
    try:
        raw = await get_pro_analyzer(analyzer_id)
        item = _to_list_item(raw)
        fields_raw = _extract_fields(raw.get("field_schema") or {})
        return AnalyzerDetail(
            **item.model_dump(),
            fields=[AnalyzerFieldItem(**f) for f in fields_raw],
        )
    except AzureCUError as exc:
        logger.error("[PRO/ANALYZERS] get %s failed: %s", analyzer_id, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        )


@router.put(
    "/{analyzer_id}",
    response_model=AnalyzerDetail,
    status_code=status.HTTP_200_OK,
    responses={
        400: {"model": ErrorDetail, "description": "Invalid analyzer ID"},
        502: {"model": ErrorDetail, "description": "Azure CU error"},
    },
    summary="Create or update a Pro analyzer (upsert via LRO)",
)
async def save_pro_analyzer_endpoint(
    analyzer_id: str,
    body: AnalyzerSaveRequest,
) -> AnalyzerDetail:
    """Create (new ID) or update (existing ID) a Pro analyzer.

    Calls the Azure CU 2025-05-01-preview REST API, waits for the LRO to
    complete, and returns the refreshed AnalyzerDetail.
    """
    if not _is_pro_analyzer(analyzer_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Analyzer ID '{analyzer_id}' is reserved and cannot be created/updated here.",
        )

    fields = [
        {
            "name": f.name,
            "type": f.type.lower(),
            "description": f.description,
            "method": f.method.lower(),
            "items_def": f.items_def,  # pass through for array fields
        }
        for f in body.fields
    ]

    try:
        raw = await save_pro_analyzer(
            analyzer_id=analyzer_id,
            description=body.description,
            schema_name=body.schema_name,
            schema_description=body.schema_description,
            fields=fields,
        )
    except AzureCUError as exc:
        logger.error("[PRO/ANALYZERS] PUT %s failed: %s", analyzer_id, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        )

    item = _to_list_item(raw)
    fields_raw = _extract_fields(raw.get("field_schema") or {})
    return AnalyzerDetail(
        **item.model_dump(),
        fields=[AnalyzerFieldItem(**f) for f in fields_raw],
    )


@router.delete(
    "/{analyzer_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={
        400: {"model": ErrorDetail, "description": "Invalid analyzer ID"},
        502: {"model": ErrorDetail, "description": "Azure CU error"},
    },
    summary="Delete a Pro analyzer permanently",
)
async def delete_pro_analyzer_endpoint(analyzer_id: str) -> None:
    """Permanently delete a Pro analyzer from Azure CU.

    This action is irreversible.  Standard-mode and prebuilt analyzers
    are rejected with 400 to prevent accidental deletion.
    """
    if not _is_pro_analyzer(analyzer_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Analyzer ID '{analyzer_id}' cannot be deleted from here.",
        )

    try:
        await delete_pro_analyzer(analyzer_id)
    except AzureCUError as exc:
        logger.error("[PRO/ANALYZERS] DELETE %s failed: %s", analyzer_id, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        )
