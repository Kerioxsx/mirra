"""Currency conversion using the European Central Bank's daily reference rates.

The ECB publishes free, official reference rates (including CNY, USD, GBP, JPY, HKD, SGD, MYR…).
Converted prices are always presented as approximate, with the rate date.
"""

from __future__ import annotations

import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from typing import Protocol

import httpx

from mirra.modules.marketplaces.base import Money

ECB_DAILY_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml"
_CENT = Decimal("0.01")


@dataclass(frozen=True)
class FxRates:
    """Units of each currency per 1 EUR."""

    as_of: date
    per_eur: dict[str, Decimal]
    source: str = "ECB euro reference rates"

    def rate(self, src: str, dst: str) -> Decimal | None:
        if src == dst:
            return Decimal(1)
        a, b = self.per_eur.get(src), self.per_eur.get(dst)
        if a is None or b is None:
            return None
        return b / a

    def convert(self, money: Money, to: str) -> Money | None:
        r = self.rate(money.currency, to)
        if r is None:
            return None
        return Money(amount=(money.amount * r).quantize(_CENT, ROUND_HALF_UP), currency=to)


class FxProvider(Protocol):
    async def rates(self) -> FxRates | None: ...


def parse_ecb_xml(xml_text: str) -> FxRates:
    root = ET.fromstring(xml_text)  # noqa: S314 - fixed, trusted ECB document; no DTD processing
    ns = {"e": "http://www.ecb.int/vocabulary/2002-08-01/eurofxref"}
    day = root.find(".//e:Cube[@time]", ns)
    if day is None:
        raise ValueError("ECB document has no dated Cube element")
    per_eur = {"EUR": Decimal(1)}
    for cube in day.findall("e:Cube", ns):
        per_eur[cube.attrib["currency"]] = Decimal(cube.attrib["rate"])
    return FxRates(as_of=date.fromisoformat(day.attrib["time"]), per_eur=per_eur)


class EcbFxProvider:
    """Fetches and caches ECB rates (they change once per working day)."""

    def __init__(self, http: httpx.AsyncClient | None = None, ttl_seconds: int = 6 * 3600) -> None:
        self._http = http or httpx.AsyncClient(timeout=6)
        self._ttl = ttl_seconds
        self._cached: tuple[float, FxRates] | None = None

    async def rates(self) -> FxRates | None:
        now = time.monotonic()
        if self._cached and now - self._cached[0] < self._ttl:
            return self._cached[1]
        try:
            resp = await self._http.get(ECB_DAILY_URL)
            resp.raise_for_status()
            rates = parse_ecb_xml(resp.text)
        except (httpx.HTTPError, ValueError, ET.ParseError):
            # keep serving the last good rates; with none, prices simply aren't converted
            return self._cached[1] if self._cached else None
        self._cached = (now, rates)
        return rates


class StaticFxProvider:
    def __init__(self, rates: FxRates | None) -> None:
        self._rates = rates

    async def rates(self) -> FxRates | None:
        return self._rates
