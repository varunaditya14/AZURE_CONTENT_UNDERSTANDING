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
