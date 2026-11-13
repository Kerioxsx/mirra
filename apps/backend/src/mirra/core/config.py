"""Application settings, read from environment variables prefixed with ``MIRRA_``."""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_DEV_SECRET = "change-me-dev-only-secret-at-least-32-characters"  # noqa: S105 - refused in prod


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="MIRRA_", env_file=".env", extra="ignore")

    env: Literal["development", "test", "production"] = "development"
    database_url: str = "postgresql+asyncpg://mirra:mirra@localhost:5432/mirra"
    redis_url: str | None = None

    jwt_secret: SecretStr = SecretStr(_DEV_SECRET)
    jwt_algorithm: Literal["HS256"] = "HS256"
    access_token_ttl_seconds: int = 15 * 60
    refresh_token_ttl_days: int = 30

    cors_origins: list[str] = Field(
        default_factory=lambda: [
            "http://localhost:3000",
            "tauri://localhost",
            "http://tauri.localhost",
            "https://tauri.localhost",
        ]
    )

    # Rate limiting for credential endpoints (per client IP).
    auth_rate_limit: int = 20
    auth_rate_window_seconds: int = 60

    # Marketplaces
    ebay_client_id: str | None = None
    ebay_client_secret: SecretStr | None = None
    ebay_marketplace_id: str = "EBAY_US"
    ebay_api_base: str = "https://api.ebay.com"
    demo_connector_enabled: bool = True

    @field_validator("jwt_secret")
    @classmethod
    def _secret_length(cls, v: SecretStr) -> SecretStr:
        if len(v.get_secret_value()) < 32:
            raise ValueError("MIRRA_JWT_SECRET must be at least 32 characters")
        return v

    @property
    def is_production(self) -> bool:
        return self.env == "production"

    @property
    def cookie_secure(self) -> bool:
        return self.is_production

    def validate_for_runtime(self) -> None:
        """Refuse to boot production with development defaults."""
        if self.is_production:
            if self.jwt_secret.get_secret_value() == _DEV_SECRET:
                raise RuntimeError("MIRRA_JWT_SECRET must be set in production")
            if self.demo_connector_enabled:
                raise RuntimeError("The demo connector must be disabled in production")


@lru_cache
def get_settings() -> Settings:
    return Settings()
