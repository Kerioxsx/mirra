"""Size guides for listings from marketplaces that use Chinese sizes."""

from __future__ import annotations

from mirra.core.taxonomy import CATEGORY_SPECS, BodyRegion, Category
from mirra.modules.marketplaces.base import NormalizedListing
from mirra.modules.sizing import cn
from mirra.modules.sizing.schemas import Kind, SizeGuide, SizeReading

CHINESE_SIZE_MARKETPLACES = frozenset({"taobao", "tmall", "weidian", "1688"})

_REGION_KIND: dict[BodyRegion, Kind] = {
    BodyRegion.torso: "top",
    BodyRegion.full_body: "top",
    BodyRegion.legs: "bottom",
    BodyRegion.feet: "shoe",
}


def kind_of(category: Category | None) -> Kind:
    if category is None:
        return "unknown"
    return _REGION_KIND.get(CATEGORY_SPECS[category][2], "unknown")


def size_guide(listing: NormalizedListing) -> SizeGuide | None:
    """The sizes a Chinese-market listing offers or its title mentions, read; None if none."""
    if listing.marketplace_id not in CHINESE_SIZE_MARKETPLACES:
        return None
    text = " ".join(t for t in (listing.original_title, listing.title) if t)
    labels = list(dict.fromkeys([*(listing.sizes_available or []), *cn.labels_in_text(text)]))
    if not labels:
        return None
    kind = kind_of(listing.category)
    cut = cn.guess_cut(text)
    readings = [r for r in (cn.read_label(x, kind, cut) for x in labels) if r]
    if not readings:
        return None
    return SizeGuide(
        labels=[r.label for r in readings],
        kind=kind,
        cut=cut,
        readings=[SizeReading.of(r) for r in readings],
    )
