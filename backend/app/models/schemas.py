from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class FieldResult(BaseModel):
    """A single extracted field with its value and confidence."""

    name: str
    value: str | None
    confidence: float | None = None
    # Dotted path for nested fields, e.g. "line_items[0].description"
    source: str | None = None


class AnalyzeResponse(BaseModel):
    """Successful analysis response returned to the frontend."""

    success: bool = True
    file_name: str
    # All file names submitted in this analysis run (multi-file Pro mode).
    # Single-file Standard mode sets this to a one-element list.
    file_names: list[str] = Field(default_factory=list)
    file_type: str
    analyzer_id: str
    latency_ms: float = Field(..., description="End-to-end latency in milliseconds")
    field_count: int
    average_confidence: float | None
    fields: list[FieldResult]
    raw_result: dict[str, Any]


class ErrorDetail(BaseModel):
    success: bool = False
    error: str
    detail: str | None = None


# ---------------------------------------------------------------------------
# Analyzer listing models
# ---------------------------------------------------------------------------


class AnalyzerFieldItem(BaseModel):
    """A single field definition from an Azure CU analyzer schema."""

    name: str
    description: str | None = None
    type: str = "string"
    method: str | None = None
    # Raw `items` object preserved for array fields, e.g. {"type": "string"}
    # or {"type": "object", "properties": {...}}.  Opaque pass-through.
    items: dict | None = None


class AnalyzerListItem(BaseModel):
    """Summary of a single Azure CU analyzer (list view)."""

    id: str
    name: str | None = None
    description: str | None = None
    status: str | None = None
    field_count: int = 0
    created_at: str | None = None
    last_modified_at: str | None = None


class AnalyzerDetail(AnalyzerListItem):
    """Full analyzer detail including schema field definitions."""

    fields: list[AnalyzerFieldItem] = []


# ---------------------------------------------------------------------------
# Analyzer authoring (create / update)
# ---------------------------------------------------------------------------


class AnalyzerFieldInput(BaseModel):
    """One field definition sent from the frontend when saving an analyzer."""

    name: str
    description: str = ""
    type: str = "string"    # azure CU wire type: string | number | date | boolean | array
    method: str = "extract"  # extract | classify | generate
    # Raw `items` object for array fields — preserved opaquely from the GET
    # response and passed back verbatim on PUT.  Defaults to {"type": "string"}.
    items_def: dict | None = None


class AnalyzerSaveRequest(BaseModel):
    """Request body for PUT /pro/analyzers/{id} (create or update)."""

    description: str = ""
    schema_name: str
    schema_description: str = ""
    fields: list[AnalyzerFieldInput] = []

# ---------------------------------------------------------------------------
# Test file set models
# ---------------------------------------------------------------------------


class TestFileItem(BaseModel):
    """Metadata for a single file stored in a test file set."""

    id: str
    name: str
    kind: str
    size: int


class TestFileSetResponse(BaseModel):
    """A persisted named collection of test files."""

    id: str
    name: str
    files: list[TestFileItem] = []
    created_at: str
    updated_at: str