"""
Pro-mode reference file sets router — persistent named collections of reference files.

Storage layout
--------------
  <backend>/data/reference_file_sets.json       — JSON index (list of set records)
  <backend>/data/reference_file_sets/<set_id>/  — per-set directory
      <file_id>_<original_filename>             — stored file bytes

Endpoints
---------
  GET    /pro/reference-file-sets                       — list all saved sets
  POST   /pro/reference-file-sets                       — create set, upload files
  PUT    /pro/reference-file-sets/{id}                  — update name / add-remove files
  DELETE /pro/reference-file-sets/{id}                  — delete set and its files
  GET    /pro/reference-file-sets/{id}/files/{file_id}  — serve a stored file
"""

from __future__ import annotations

import json
import mimetypes
import pathlib
import shutil
import uuid
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse

from app.models.schemas import TestFileItem, TestFileSetResponse

router = APIRouter(prefix="/pro/reference-file-sets", tags=["pro"])

# ---------------------------------------------------------------------------
# Storage paths  (resolved relative to this file → backend/data/...)
# ---------------------------------------------------------------------------

_BACKEND_DIR = pathlib.Path(__file__).parent.parent.parent  # .../backend/
DATA_DIR = _BACKEND_DIR / "data"
SETS_DIR = DATA_DIR / "reference_file_sets"
INDEX_FILE = DATA_DIR / "reference_file_sets.json"


def _ensure_dirs() -> None:
    SETS_DIR.mkdir(parents=True, exist_ok=True)


def _load_index() -> list[dict]:
    if not INDEX_FILE.exists():
        return []
    with INDEX_FILE.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def _save_index(sets: list[dict]) -> None:
    INDEX_FILE.parent.mkdir(parents=True, exist_ok=True)
    with INDEX_FILE.open("w", encoding="utf-8") as fh:
        json.dump(sets, fh, indent=2, ensure_ascii=False)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _detect_kind(content_type: str, filename: str) -> str:
    ct = (content_type or "").lower().split(";")[0].strip()
    fn = filename.lower()
    if ct == "application/pdf" or fn.endswith(".pdf"):
        return "pdf"
    if ct.startswith("image/"):
        return "image"
    if (
        ct == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        or fn.endswith(".docx")
    ):
        return "docx"
    if ct == "text/plain" or fn.endswith(".txt"):
        return "txt"
    return "other"


# ---------------------------------------------------------------------------
# List
# ---------------------------------------------------------------------------


@router.get("", response_model=list[TestFileSetResponse])
async def list_reference_file_sets() -> list[TestFileSetResponse]:
    _ensure_dirs()
    return [TestFileSetResponse(**s) for s in _load_index()]


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------


@router.post(
    "",
    response_model=TestFileSetResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_reference_file_set(
    name: str = Form(...),
    files: List[UploadFile] = File(default=[]),
) -> TestFileSetResponse:
    _ensure_dirs()
    set_id = f"rfs-{uuid.uuid4().hex[:10]}"
    set_dir = SETS_DIR / set_id
    set_dir.mkdir(parents=True, exist_ok=True)

    file_items: list[dict] = []
    for uf in files:
        file_id = f"rffile-{uuid.uuid4().hex[:10]}"
        fname = uf.filename or "upload"
        data = await uf.read()
        (set_dir / f"{file_id}_{fname}").write_bytes(data)
        file_items.append(
            {
                "id": file_id,
                "name": fname,
                "kind": _detect_kind(uf.content_type or "", fname),
                "size": len(data),
            }
        )

    now = _now()
    record: dict = {
        "id": set_id,
        "name": name.strip() or "Reference set",
        "files": file_items,
        "created_at": now,
        "updated_at": now,
    }
    sets = _load_index()
    sets.append(record)
    _save_index(sets)
    return TestFileSetResponse(**record)


# ---------------------------------------------------------------------------
# Update  (keep existing files by ID + upload new ones)
# ---------------------------------------------------------------------------


@router.put("/{set_id}", response_model=TestFileSetResponse)
async def update_reference_file_set(
    set_id: str,
    name: str = Form(...),
    keep_file_ids: str = Form(default="[]"),   # JSON array of backend file IDs to keep
    new_files: List[UploadFile] = File(default=[]),
) -> TestFileSetResponse:
    _ensure_dirs()
    sets = _load_index()
    idx = next((i for i, s in enumerate(sets) if s["id"] == set_id), None)
    if idx is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Reference file set not found",
        )

    record = sets[idx]
    set_dir = SETS_DIR / set_id
    set_dir.mkdir(parents=True, exist_ok=True)

    try:
        keep_ids: list[str] = json.loads(keep_file_ids)
    except (json.JSONDecodeError, TypeError, ValueError):
        keep_ids = []

    # Retain kept files; delete removed ones from disk.
    kept: list[dict] = []
    for fi in record.get("files", []):
        if fi["id"] in keep_ids:
            kept.append(fi)
        else:
            for p in set_dir.glob(f"{fi['id']}_*"):
                p.unlink(missing_ok=True)

    # Add newly uploaded files.
    for uf in new_files:
        file_id = f"rffile-{uuid.uuid4().hex[:10]}"
        fname = uf.filename or "upload"
        data = await uf.read()
        (set_dir / f"{file_id}_{fname}").write_bytes(data)
        kept.append(
            {
                "id": file_id,
                "name": fname,
                "kind": _detect_kind(uf.content_type or "", fname),
                "size": len(data),
            }
        )

    record["name"] = name.strip() or record["name"]
    record["files"] = kept
    record["updated_at"] = _now()
    sets[idx] = record
    _save_index(sets)
    return TestFileSetResponse(**record)


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------


@router.delete("/{set_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_reference_file_set(set_id: str) -> None:
    _ensure_dirs()
    sets = _load_index()
    idx = next((i for i, s in enumerate(sets) if s["id"] == set_id), None)
    if idx is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Reference file set not found",
        )
    sets.pop(idx)
    _save_index(sets)
    set_dir = SETS_DIR / set_id
    if set_dir.exists():
        shutil.rmtree(set_dir, ignore_errors=True)


# ---------------------------------------------------------------------------
# Serve a stored file  (used by browser for preview and by the analyze route)
# ---------------------------------------------------------------------------


@router.get("/{set_id}/files/{file_id}")
async def get_reference_file(set_id: str, file_id: str) -> FileResponse:
    set_dir = SETS_DIR / set_id
    matches = list(set_dir.glob(f"{file_id}_*")) if set_dir.exists() else []
    if not matches:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="File not found",
        )
    path = matches[0]
    mt, _ = mimetypes.guess_type(path.name)
    # Serve inline so the browser can display the file without triggering a download.
    return FileResponse(
        str(path),
        media_type=mt or "application/octet-stream",
        headers={"Content-Disposition": "inline"},
    )
