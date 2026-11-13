"""Column type helpers."""

from __future__ import annotations

from enum import StrEnum

from sqlalchemy import Enum


def str_enum(enum_cls: type[StrEnum], *, constrained: bool = True) -> Enum:
    """Store a StrEnum as VARCHAR (optionally with a CHECK constraint), never a native PG enum."""
    return Enum(
        enum_cls,
        native_enum=False,
        create_constraint=constrained,
        values_callable=lambda e: [m.value for m in e],
        length=32,
        name=enum_cls.__name__.lower(),
        validate_strings=True,
    )
