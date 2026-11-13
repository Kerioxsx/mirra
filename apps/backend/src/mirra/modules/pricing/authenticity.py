"""Rule-based authenticity labelling for listings from any marketplace.

Rules can only *downgrade* trust (replica, look-alike) or recognise brand-owned stores. A listing is
never upgraded to "authenticated" here — that needs a marketplace authentication programme.
Every label comes with human-readable reasons so the UI can explain it.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from mirra.core.taxonomy import Authenticity

# Terms whose presence means the listing itself advertises a counterfeit.
_STRONG_REPLICA: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\breplicas?\b", re.I), "says “replica”"),
    (re.compile(r"\breps?\b", re.I), "says “rep”"),
    (re.compile(r"\b1\s*[:：]\s*1\b"), "says “1:1”"),  # noqa: RUF001 - full-width colon on purpose
    (re.compile(r"\bmirror\s+(quality|grade)\b", re.I), "says “mirror quality”"),
    (re.compile(r"\bunauthori[sz]ed\s+authentic\b", re.I), "says “unauthorized authentic”"),
    (re.compile(r"\bfake\b", re.I), "says “fake”"),
    (re.compile(r"\bknock[- ]?offs?\b", re.I), "says “knock-off”"),
    # Machine-translated forms, as returned by marketplaces' English modes
    (re.compile(r"\bhigh[- ](imitation|copy|replica)\b", re.I), "says “high imitation”"),
    (re.compile(r"\bimitation\b", re.I), "says “imitation”"),
    (re.compile(r"\bputian\b", re.I), "mentions Putian (known for counterfeit sneakers)"),
    (re.compile(r"\btop (version|replica)\b", re.I), "says “top version”"),
    (re.compile(r"高仿"), "says 高仿 (high-grade imitation)"),
    (re.compile(r"仿品"), "says 仿品 (imitation)"),
    (re.compile(r"A货|超A"), "says A货 (counterfeit grade)"),
    (re.compile(r"1比1|一比一"), "says 1比1 (1:1 copy)"),
    (re.compile(r"莆田"), "says 莆田 (Putian, known for counterfeit sneakers)"),
    (re.compile(r"纯原"), "says 纯原 (replica-factory grade)"),
    (re.compile(r"公司级"), "says 公司级 (replica-factory grade)"),
    (re.compile(r"顶级版本"), "says 顶级版本 (top replica version)"),
    (re.compile(r"过验"), "says 过验 (passes authentication checks)"),
]

# Ambiguous on their own (复刻 is also used for official retro re-releases), so two are needed.
_WEAK_REPLICA: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"复刻"), "says 复刻 (re-made)"),
    (re.compile(r"原单"), "says 原单 (claimed factory original)"),
    (re.compile(r"原厂"), "says 原厂 (claimed original factory)"),
    (re.compile(r"尾单"), "says 尾单 (claimed factory leftover)"),
    (re.compile(r"\bUA\b"), "says “UA”"),
]

# "Same style" wording: a look-alike that doesn't claim to be the brand.
_ALTERNATIVE: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"同款"), "says 同款 (same style)"),
    (re.compile(r"平替"), "says 平替 (affordable alternative)"),
    (re.compile(r"\bdupes?\b", re.I), "says “dupe”"),
    (re.compile(r"\bsame\s+style\b", re.I), "says “same style”"),
    # common machine translations of 同款
    (
        re.compile(r"\bsame\s+(paragraph|model|section)\b", re.I),
        "says “same style” (machine-translated 同款)",
    ),
    (re.compile(r"\binspired\b", re.I), "says “inspired”"),
    (re.compile(r"\blook[- ]?alike\b", re.I), "says “look-alike”"),
]

_OFFICIAL_STORE = re.compile(r"官方旗舰店|official\s+flagship\s+store", re.I)


@dataclass(frozen=True)
class AuthenticityVerdict:
    value: Authenticity
    reasons: list[str] = field(default_factory=list)


def classify(
    text: str,
    *,
    shop_name: str | None = None,
    is_brand_platform_store: bool = False,
    default: Authenticity = Authenticity.unverified,
) -> AuthenticityVerdict:
    """Label a listing from its title/description and the store selling it.

    ``is_brand_platform_store`` is true when the marketplace itself vets the store type (e.g. a
    Tmall store); combined with an "official flagship store" name it means the brand sells it.
    """
    strong = [why for rx, why in _STRONG_REPLICA if rx.search(text)]
    if strong:
        return AuthenticityVerdict(
            Authenticity.replica_advertised, [f"Listing {w}" for w in strong]
        )

    if is_brand_platform_store and shop_name and _OFFICIAL_STORE.search(shop_name):
        return AuthenticityVerdict(
            Authenticity.brand_direct,
            [f"Sold by the brand's official flagship store ({shop_name})"],
        )

    weak = [why for rx, why in _WEAK_REPLICA if rx.search(text)]
    if len(weak) >= 2:
        return AuthenticityVerdict(Authenticity.replica_advertised, [f"Listing {w}" for w in weak])

    alt = [why for rx, why in _ALTERNATIVE if rx.search(text)]
    if alt:
        return AuthenticityVerdict(
            Authenticity.style_alternative,
            [f"Listing {alt[0]} — a look-alike, not the branded product"]
            + [f"Also: listing {w}" for w in [*alt[1:], *weak]],
        )
    return AuthenticityVerdict(default, [f"Listing {w}" for w in weak])
