"""
FastAPI application entry point for the Azure Content Understanding demo.
"""

from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import analyze, analyzers, pro_analyze, reference_file_sets, test_file_sets

# Show INFO logs from our modules in the uvicorn console
logging.basicConfig(level=logging.INFO)
logging.getLogger("app").setLevel(logging.INFO)

app = FastAPI(
    title="Azure Content Understanding Demo API",
    version="1.0.0",
    description=(
        "Two-mode Azure Content Understanding demo.\n\n"
        "**Standard mode** — POST /standard/analyze\n"
        "Accepts file uploads and routes them to MIME-type-specific Standard analyzers "
        "configured via ANALYZER_ID_* environment variables.\n\n"
        "**Pro mode** — GET /pro/analyzers, GET /pro/analyzers/{id}\n"
        "Lists and details custom/Foundry-created Pro analyzers from the configured "
        "Pro Azure CU resource (PRO_AZURE_CU_ENDPOINT / PRO_AZURE_CU_KEY, falling back "
        "to the Standard credentials if not set)."
    ),
)

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
app.include_router(analyze.router)
app.include_router(analyzers.router)
app.include_router(pro_analyze.router)
app.include_router(test_file_sets.router)
app.include_router(reference_file_sets.router)


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------
@app.get("/health", tags=["health"])
async def health() -> dict[str, str]:
    return {"status": "ok"}
