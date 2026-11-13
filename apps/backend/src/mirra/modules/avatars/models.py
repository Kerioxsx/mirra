from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import Boolean, ForeignKey, Index, String, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from mirra.db.base import Base, Timestamps, UUIDPk


class Avatar(UUIDPk, Timestamps, Base):
    """A saved avatar configuration. Body values are normalized 0..1, not raw morph weights."""

    __tablename__ = "avatars"
    __table_args__ = (
        Index(
            "uq_avatars_one_default_per_user",
            "user_id",
            unique=True,
            postgresql_where=text("is_default"),
        ),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    preset: Mapped[str | None] = mapped_column(String(40))
    body: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, server_default="{}")
    appearance: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, server_default="{}")
    rig_version: Mapped[str] = mapped_column(String(32), default="mirra-rig@1")
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
