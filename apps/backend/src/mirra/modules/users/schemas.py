from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, ConfigDict, EmailStr, Field, StringConstraints, model_validator

from mirra.core.taxonomy import RenderQuality

DisplayName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
Tag = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)]
SizeValue = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=20)]
SizeKey = Annotated[str, StringConstraints(pattern=r"^[a-z_]{1,20}$")]


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: EmailStr
    display_name: str
    is_verified: bool
    created_at: datetime


class UserUpdate(BaseModel):
    display_name: DisplayName | None = None


class AccountDelete(BaseModel):
    password: str = Field(min_length=1, max_length=128)


class Preferences(BaseModel):
    """Style profile used by search ranking, the AI stylist and the dresser."""

    model_config = ConfigDict(from_attributes=True)

    styles: list[Tag] = Field(default_factory=list, max_length=20)
    favorite_brands: list[Tag] = Field(default_factory=list, max_length=50)
    avoided_brands: list[Tag] = Field(default_factory=list, max_length=50)
    colors_liked: list[Tag] = Field(default_factory=list, max_length=20)
    colors_avoided: list[Tag] = Field(default_factory=list, max_length=20)
    sizes: dict[SizeKey, SizeValue] = Field(default_factory=dict, max_length=12)
    budget_min: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    budget_max: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    currency: Annotated[str, StringConstraints(pattern=r"^[A-Z]{3}$")] = "USD"
    ship_to_country: Annotated[str, StringConstraints(pattern=r"^[A-Z]{2}$")] | None = None
    preferred_marketplaces: list[Tag] = Field(default_factory=list, max_length=20)
    render_quality: RenderQuality = RenderQuality.medium

    @model_validator(mode="after")
    def _budget_order(self) -> Preferences:
        if (
            self.budget_min is not None
            and self.budget_max is not None
            and self.budget_min > self.budget_max
        ):
            raise ValueError("budget_min must not exceed budget_max")
        return self
