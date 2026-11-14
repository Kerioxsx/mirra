"""Estimated cost to get an item to the buyer: item price + shipping legs, in the buyer's currency.

Unknown parts stay unknown. International shipping is only estimated when the operator has
configured a forwarding rate; otherwise the UI says it depends on the buyer's forwarder.
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

from pydantic import BaseModel, Field

from mirra.core.taxonomy import Category
from mirra.modules.marketplaces.base import Money
from mirra.modules.pricing.fx import FxRates

# Rough packed weights (kg) used only for forwarding estimates. Always labelled as estimates.
PACKED_WEIGHT_KG: dict[Category, Decimal] = {
    Category.t_shirt: Decimal("0.25"),
    Category.tank_top: Decimal("0.2"),
    Category.long_sleeve: Decimal("0.3"),
    Category.shirt: Decimal("0.3"),
    Category.sweater: Decimal("0.6"),
    Category.hoodie: Decimal("0.8"),
    Category.sweatshirt: Decimal("0.7"),
    Category.vest: Decimal("0.5"),
    Category.zip_up: Decimal("0.8"),
    Category.jacket: Decimal("1.1"),
    Category.coat: Decimal("1.6"),
    Category.dress: Decimal("0.5"),
    Category.jumpsuit: Decimal("0.7"),
    Category.jeans: Decimal("0.8"),
    Category.baggy_pants: Decimal("0.9"),
    Category.cargo_pants: Decimal("0.9"),
    Category.trousers: Decimal("0.7"),
    Category.sweatpants: Decimal("0.6"),
    Category.shorts: Decimal("0.4"),
    Category.skirt: Decimal("0.4"),
    Category.sneakers: Decimal("1.3"),
    Category.boots: Decimal("1.9"),
    Category.shoes: Decimal("1.1"),
    Category.sandals: Decimal("0.7"),
    Category.hat: Decimal("0.25"),
    Category.cap: Decimal("0.2"),
    Category.beanie: Decimal("0.15"),
    Category.glasses: Decimal("0.15"),
    Category.jewelry: Decimal("0.1"),
    Category.scarf: Decimal("0.25"),
    Category.belt: Decimal("0.3"),
    Category.watch: Decimal("0.2"),
    Category.bag: Decimal("0.7"),
    Category.accessory: Decimal("0.2"),
}
assert set(PACKED_WEIGHT_KG) == set(Category)

_CENT = Decimal("0.01")


class CostComponent(BaseModel):
    label: str
    amount: Money | None = Field(description="In the buyer's currency; None = unknown")
    estimate: bool = False
    note: str | None = None


class LandedCost(BaseModel):
    currency: str
    components: list[CostComponent]
    total_known: Money | None = Field(description="Sum of the known components")
    complete: bool = Field(description="False if any component is unknown")
    fx_as_of: str | None = None


class ExtraFee(BaseModel):
    """An additional cost line (e.g. an agent's service or customs-declaration fee)."""

    label: str
    amount: Money | None
    estimate: bool = False
    note: str | None = None


class ForwardingRate(BaseModel):
    per_kg: Money
    label: str = "International shipping via forwarder"


def estimate_landed_cost(
    *,
    price: Money,
    target_currency: str,
    fx: FxRates | None,
    domestic_shipping: Money | None,
    domestic_shipping_label: str,
    category: Category | None,
    cross_border: bool,
    forwarding: ForwardingRate | None,
    extra_fees: list[ExtraFee] | None = None,
) -> LandedCost | None:
    """Return None when the price can't even be expressed in the buyer's currency."""

    def conv(m: Money | None) -> Money | None:
        if m is None:
            return None
        if m.currency == target_currency:
            return m
        return fx.convert(m, target_currency) if fx else None

    item = conv(price)
    if item is None:
        return None
    converted = price.currency != target_currency
    comps = [
        CostComponent(
            label="Item",
            amount=item,
            estimate=converted,
            note=f"Converted from {price.amount} {price.currency}" if converted else None,
        ),
        CostComponent(
            label=domestic_shipping_label,
            amount=conv(domestic_shipping),
            estimate=domestic_shipping is not None
            and domestic_shipping.currency != target_currency,
            note=None if domestic_shipping is not None else "Not provided by the marketplace",
        ),
    ]
    for fee in extra_fees or []:
        converted_fee = conv(fee.amount)
        comps.append(
            CostComponent(
                label=fee.label,
                amount=converted_fee,
                estimate=fee.estimate
                or (fee.amount is not None and fee.amount.currency != target_currency),
                note=fee.note
                if converted_fee is not None or fee.amount is None
                else "Can't convert this fee",
            )
        )
    if cross_border:
        intl: Money | None = None
        note = "Depends on your forwarder or consolidation service"
        if forwarding and category:
            per_kg = conv(forwarding.per_kg)
            if per_kg is not None:
                kg = PACKED_WEIGHT_KG[category]
                intl = Money(
                    amount=(per_kg.amount * kg).quantize(_CENT, ROUND_HALF_UP),
                    currency=target_currency,
                )
                note = f"Estimated for ~{kg} kg packed at {per_kg.amount} {target_currency}/kg"
        comps.append(
            CostComponent(label="International shipping", amount=intl, estimate=True, note=note)
        )

    known = [c.amount.amount for c in comps if c.amount is not None]
    return LandedCost(
        currency=target_currency,
        components=comps,
        total_known=Money(amount=sum(known, Decimal(0)).quantize(_CENT), currency=target_currency),
        complete=all(c.amount is not None for c in comps),
        fx_as_of=fx.as_of.isoformat() if (fx and converted) else None,
    )
