from __future__ import annotations

from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ---------------------------------------------------------------------------
    # Standard mode — Azure CU resource used for MIME-routed file analysis
    # ---------------------------------------------------------------------------
    AZURE_CU_ENDPOINT: str
    AZURE_CU_KEY: str
    ANALYZER_ID_DOCUMENT: str
    ANALYZER_ID_IMAGE: str
    ANALYZER_ID_AUDIO: str = ""
    ANALYZER_ID_VIDEO: str = ""

    # ---------------------------------------------------------------------------
    # Pro mode — optional separate Azure CU resource for custom/Foundry analyzers.
    # If not set, Pro mode falls back to the same endpoint/key as Standard mode.
    # Set PRO_AZURE_CU_ENDPOINT and PRO_AZURE_CU_KEY in .env to point Pro mode
    # at a different Azure AI resource (e.g. a Foundry custom-task resource).
    # ---------------------------------------------------------------------------
    PRO_AZURE_CU_ENDPOINT: str = ""
    PRO_AZURE_CU_KEY: str = ""
    # Foundry custom-task analyzers require the preview API version.
    # Standard mode continues to use AZURE_CU_API_VERSION (GA).
    PRO_AZURE_CU_API_VERSION: str = "2025-05-01-preview"
    # Foundry project ID that scopes the Pro analyzer list.
    # Copy from the Foundry portal URL: .../custom-tasks/{PROJECT_ID}/...
    # If empty, all non-prebuilt project-tagged analyzers are shown.
    PRO_FOUNDRY_PROJECT_ID: str = ""

    # Azure Content Understanding SDK API version (override via env if needed)
    AZURE_CU_API_VERSION: str = "2025-11-01"

    # Comma-separated list of allowed CORS origins — must be set explicitly in .env
    ALLOWED_ORIGINS: str = ""

    @field_validator("AZURE_CU_ENDPOINT")
    @classmethod
    def strip_trailing_slash(cls, v: str) -> str:
        return v.rstrip("/")

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]

    @property
    def pro_cu_endpoint(self) -> str:
        """Resolved Pro Azure CU endpoint (falls back to standard if not configured)."""
        return (self.PRO_AZURE_CU_ENDPOINT or self.AZURE_CU_ENDPOINT).rstrip("/")

    @property
    def pro_cu_key(self) -> str:
        """Resolved Pro Azure CU API key (falls back to standard if not configured)."""
        return self.PRO_AZURE_CU_KEY or self.AZURE_CU_KEY

    @property
    def pro_cu_api_version(self) -> str:
        """API version used for Pro-mode REST calls (listing/detail).

        Foundry custom-task analyzers are only visible via the preview API.
        Falls back to AZURE_CU_API_VERSION if PRO_AZURE_CU_API_VERSION is unset.
        """
        return self.PRO_AZURE_CU_API_VERSION or self.AZURE_CU_API_VERSION

    @property
    def standard_analyzer_ids(self) -> frozenset[str]:
        """Set of analyzer IDs reserved for Standard mode (from ANALYZER_ID_* env vars).

        Used by the Pro router to exclude Standard-mode analyzers from the Pro list
        so the two pools never overlap, even when both modes share the same Azure resource.
        """
        return frozenset(
            aid.strip()
            for aid in (
                self.ANALYZER_ID_DOCUMENT,
                self.ANALYZER_ID_IMAGE,
                self.ANALYZER_ID_AUDIO,
                self.ANALYZER_ID_VIDEO,
            )
            if aid.strip()
        )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings: Settings = get_settings()
