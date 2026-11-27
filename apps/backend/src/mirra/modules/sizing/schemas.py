from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from mirra.modules.sizing.cn import Body, Reading

Kind = Literal["top", "bottom", "shoe", "unknown"]
Cut = Literal["mens", "womens", "unisex"]

DISCLAIMER = (
    "Estimates from the Chinese national size code and typical Chinese size charts. Shops cut "
    "differently: the shop's own size chart wins."
)


class SizeRange(BaseModel):
    min: float
    max: float


class SizeReading(BaseModel):
    label: str
    system: Literal["gb_code", "letter", "waist_inches", "waist_chi", "eu_shoe", "one_size"]
    kind: Kind
    basis: Literal["standard", "typical"] = Field(
        description="standard: the national size code (GB/T 1335); typical: common shop charts"
    )
    height_cm: SizeRange | None = None
    chest_cm: SizeRange | None = None
    waist_cm: SizeRange | None = None
    foot_mm: SizeRange | None = None
    body_type: str | None = None
    note: str

    @classmethod
    def of(cls, r: Reading) -> SizeReading:
        def rng(v: tuple[float, float] | None) -> SizeRange | None:
            return SizeRange(min=v[0], max=v[1]) if v else None

        b: Body = r.body
        return cls(
            label=r.label,
            system=r.system,
            kind=r.kind,
            basis=r.basis,
            height_cm=rng(b.height_cm),
            chest_cm=rng(b.chest_cm),
            waist_cm=rng(b.waist_cm),
            foot_mm=rng(b.foot_mm),
            body_type=r.body_type,
            note=r.note,
        )


class Measurements(BaseModel):
    """The shopper's body, not a garment's."""

    height_cm: float | None = Field(default=None, ge=100, le=230)
    chest_cm: float | None = Field(default=None, ge=50, le=170)
    waist_cm: float | None = Field(default=None, ge=40, le=170)
    foot_mm: float | None = Field(default=None, ge=180, le=340)


class SizeAdviceRequest(BaseModel):
    labels: list[str] = Field(min_length=1, max_length=30)
    kind: Kind = "unknown"
    cut: Cut = "unisex"
    measurements: Measurements = Field(default_factory=Measurements)


class SizeAdvice(BaseModel):
    suggested: str | None = Field(description="The label that fits best, or None")
    reason: str
    readings: list[SizeReading]
    disclaimer: str = DISCLAIMER


class SizeGuide(BaseModel):
    """Size labels found on a listing (for marketplaces that use Chinese sizes)."""

    labels: list[str]
    kind: Kind
    cut: Cut
    readings: list[SizeReading]
    disclaimer: str = DISCLAIMER
