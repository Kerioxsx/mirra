"""Who is shopping, and in which currency/country: shared by search and listing endpoints."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Query, Request

from mirra.core.config import get_settings
from mirra.modules.auth.deps import OptionalUser, SessionDep
from mirra.modules.marketplaces.base import Money
from mirra.modules.pricing.fx import FxProvider, FxRates
from mirra.modules.pricing.landed_cost import ForwardingRate
from mirra.modules.search.schemas import FxInfo
from mirra.modules.users.models import User
from mirra.modules.users.service import get_preferences


@dataclass(frozen=True)
class ShopperContext:
    currency: str
    ship_to: str | None
    fx: FxRates | None
    forwarding: ForwardingRate | None
    user: User | None

    @property
    def fx_info(self) -> FxInfo | None:
        return FxInfo(source=self.fx.source, as_of=self.fx.as_of.isoformat()) if self.fx else None


async def shopper_context(
    request: Request,
    session: SessionDep,
    user: OptionalUser,
    currency: Annotated[str | None, Query(pattern=r"^[A-Z]{3}$")] = None,
    ship_to: Annotated[str | None, Query(pattern=r"^[A-Z]{2}$")] = None,
) -> ShopperContext:
    """Explicit query params win; otherwise a signed-in shopper's profile; otherwise USD."""
    s = get_settings()
    if user is not None and (currency is None or ship_to is None):
        prefs = await get_preferences(session, user.id)
        currency = currency or prefs.currency
        ship_to = ship_to or prefs.ship_to_country
    fx_provider: FxProvider = request.app.state.fx
    forwarding = (
        ForwardingRate(
            per_kg=Money(amount=s.forwarding_rate_per_kg, currency=s.forwarding_currency)
        )
        if s.forwarding_rate_per_kg is not None
        else None
    )
    return ShopperContext(
        currency=currency or "USD",
        ship_to=ship_to,
        fx=await fx_provider.rates(),
        forwarding=forwarding,
        user=user,
    )


ShopperDep = Annotated[ShopperContext, Depends(shopper_context)]
