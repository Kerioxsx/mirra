"""Deal finder (blueprint Workflow C): the same look, cheaper, across every live marketplace.

Match scores are heuristic estimates (category, colour, title words) and are labelled as such.
Listings that advertise themselves as replicas are never suggested as deals.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from decimal import Decimal

from mirra.core.taxonomy import Authenticity, Category
from mirra.modules.marketplaces.base import Money, NormalizedListing
from mirra.modules.marketplaces.connectors.taobao.language import REFINEMENTS

# What shoppers would type for each category (fed to each connector's own translation).
QUERY_TERMS: dict[Category, str] = {
    Category.t_shirt: "t-shirt",
    Category.tank_top: "tank top",
    Category.long_sleeve: "long sleeve",
    Category.shirt: "shirt",
    Category.sweater: "sweater",
    Category.hoodie: "hoodie",
    Category.sweatshirt: "sweatshirt",
    Category.zip_up: "zip-up hoodie",
    Category.vest: "vest",
    Category.jacket: "jacket",
    Category.coat: "coat",
    Category.dress: "dress",
    Category.jumpsuit: "jumpsuit",
    Category.jeans: "jeans",
    Category.baggy_pants: "baggy pants",
    Category.cargo_pants: "cargo pants",
    Category.trousers: "trousers",
    Category.sweatpants: "sweatpants",
    Category.shorts: "shorts",
    Category.skirt: "skirt",
    Category.sneakers: "sneakers",
    Category.boots: "boots",
    Category.shoes: "shoes",
    Category.sandals: "sandals",
    Category.hat: "hat",
    Category.cap: "cap",
    Category.beanie: "beanie",
    Category.glasses: "glasses",
    Category.jewelry: "necklace",
    Category.scarf: "scarf",
    Category.belt: "belt",
    Category.watch: "watch",
    Category.bag: "bag",
    Category.accessory: "accessory",
}
assert set(QUERY_TERMS) == set(Category)

_STYLE_WORDS = re.compile(
    r"\b(oversized?|baggy|loose|relaxed|slim|cropped|wide[- ]leg|straight|vintage|retro|washed|"
    r"distressed|heavyweight|leather|denim|nylon|wool|knit|corduroy|fleece|graphic|striped|plaid|camo)\b",
    re.I,
)
_TOKEN = re.compile(r"[a-z0-9]+|[\u3400-\u9fff]")
_CJK_CHAR = re.compile(r"[\u3400-\u9fff]")
_STOP = {
    "the",
    "and",
    "for",
    "with",
    "a",
    "an",
    "of",
    "in",
    "new",
    "men",
    "women",
    "mens",
    "womens",
    "unisex",
}


def query_for(listing: NormalizedListing) -> str:
    parts: list[str] = []
    if listing.colors:
        parts.append(listing.colors[0])
    parts += list(dict.fromkeys(m.group(0).lower() for m in _STYLE_WORDS.finditer(listing.title)))[
        :2
    ]
    parts.append(QUERY_TERMS[listing.category] if listing.category else listing.title[:60])
    return " ".join(parts)


def _tokens(text: str) -> set[str]:
    return {
        t
        for t in _TOKEN.findall(text.lower())
        if (t not in _STOP and len(t) > 1) or _CJK_CHAR.fullmatch(t)
    }


def _jaccard(a: set[str], b: set[str]) -> float:
    return len(a & b) / len(a | b) if a and b else 0.0


@dataclass(frozen=True)
class Match:
    score: float
    reasons: list[str]


def match(base: NormalizedListing, other: NormalizedListing) -> Match:
    score = 0.0
    reasons: list[str] = []
    if base.category and other.category:
        if base.category == other.category:
            score += 0.45
            reasons.append("Same category")
        elif other.category in REFINEMENTS.get(
            base.category, set()
        ) or base.category in REFINEMENTS.get(other.category, set()):
            score += 0.25
            reasons.append("Related category")
    shared = sorted(set(base.colors) & set(other.colors))
    if base.colors and other.colors:
        score += 0.25 * _jaccard(set(base.colors), set(other.colors))
        if shared:
            reasons.append(f"Same colour ({', '.join(shared)})")
    title = _jaccard(_tokens(base.title), _tokens(other.title))
    score += 0.3 * min(1.0, title * 2)
    if title >= 0.2:
        reasons.append("Similar description")
    return Match(round(min(score, 1.0), 2), reasons)


def is_suggestible(listing: NormalizedListing) -> bool:
    return listing.authenticity is not Authenticity.replica_advertised


def savings(base: Money | None, other: Money | None) -> Money | None:
    if not base or not other or base.currency != other.currency:
        return None
    diff = Decimal(base.amount) - Decimal(other.amount)
    return (
        Money(amount=diff.quantize(Decimal("0.01")), currency=base.currency) if diff > 0 else None
    )
