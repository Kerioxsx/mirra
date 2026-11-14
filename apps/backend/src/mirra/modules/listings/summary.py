from __future__ import annotations

from mirra.modules.listings.schemas import ListingSummary
from mirra.modules.marketplaces.repository import StoredListing


def summarize(stored: StoredListing) -> ListingSummary:
    item = stored.listing
    return ListingSummary(
        id=stored.id,
        marketplace_id=item.marketplace_id,
        external_id=item.external_id,
        title=item.title,
        url=item.url,
        image_url=item.image_urls[0] if item.image_urls else None,
        price=item.price,
        category=item.category.value if item.category else None,
        colors=item.colors,
        authenticity=item.authenticity,
        store_badge=item.store_badge,
        is_demo=item.is_demo,
        stale=stored.is_stale,
    )
