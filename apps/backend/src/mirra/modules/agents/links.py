"""Recognise marketplace item links without fetching anything.

Supports Taobao, Tmall, Weidian and 1688 item URLs (desktop and mobile forms), and unwraps links
that carry the original as a parameter — KakoBuy item pages (``?url=``) and deep links such as
Taobao's ``intl.taobao.com/dp?h5Url=``. Short links (m.tb.cn, e.tb.cn…) would need a network call
to expand, so they are reported as such instead of being guessed.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal
from urllib.parse import parse_qs, unquote, urlparse

Source = Literal["taobao", "tmall", "weidian", "1688"]

SOURCE_NAMES: dict[Source, str] = {
    "taobao": "Taobao",
    "tmall": "Tmall",
    "weidian": "Weidian",
    "1688": "1688",
}

_SHORT_HOSTS = {"m.tb.cn", "e.tb.cn", "s.click.taobao.com", "tb.cn", "k.weidian.com", "qr.1688.com"}
_WRAPPER_PARAMS = ("url", "h5Url", "h5url", "target", "redirect", "redirectUrl", "link")
_DIGITS = re.compile(r"^\d{5,20}$")


@dataclass(frozen=True)
class SourceLink:
    source: Source
    item_id: str
    canonical_url: str


class LinkError(ValueError):
    """The text isn't a supported item link (the message says why, for the shopper)."""


def canonical(source: Source, item_id: str) -> str:
    return {
        "taobao": f"https://item.taobao.com/item.htm?id={item_id}",
        "tmall": f"https://detail.tmall.com/item.htm?id={item_id}",
        "weidian": f"https://weidian.com/item.html?itemID={item_id}",
        "1688": f"https://detail.1688.com/offer/{item_id}.html",
    }[source]


def _id(qs: dict[str, list[str]], *keys: str) -> str | None:
    for k in keys:
        for v in qs.get(k, []):
            if _DIGITS.match(v):
                return v
    return None


def _direct(host: str, path: str, qs: dict[str, list[str]]) -> SourceLink | None:
    host = host.lower().removeprefix("www.")
    if (host.endswith(("tmall.com", "tmall.hk"))) and (item := _id(qs, "id")) is not None:
        return SourceLink("tmall", item, canonical("tmall", item))
    if host.endswith("taobao.com"):
        if (item := _id(qs, "id", "itemId", "item_id")) is not None:
            return SourceLink("taobao", item, canonical("taobao", item))
        m = re.search(r"/item/(\d{5,20})\.htm", path)  # world.taobao.com/item/<id>.htm
        if m:
            return SourceLink("taobao", m.group(1), canonical("taobao", m.group(1)))
    if host.endswith("weidian.com") and (item := _id(qs, "itemID", "itemId", "itemid")) is not None:
        return SourceLink("weidian", item, canonical("weidian", item))
    if host.endswith("1688.com"):
        m = re.search(r"/offer/(\d{5,20})\.html", path)
        if m:
            return SourceLink("1688", m.group(1), canonical("1688", m.group(1)))
        if (item := _id(qs, "offerId", "offerid")) is not None:
            return SourceLink("1688", item, canonical("1688", item))
    return None


def parse_item_link(text: str, _depth: int = 0) -> SourceLink:
    """The marketplace item behind ``text``; raises LinkError with a shopper-facing reason."""
    raw = text.strip()
    if not raw or len(raw) > 4000:
        raise LinkError("Paste a product link from Taobao, Tmall, Weidian, 1688 or KakoBuy.")
    # share texts often wrap the link in other words: take the first URL-looking token
    m = re.search(r"(https?://\S+|(?:[\w-]+\.)+(?:com|cn|hk)/\S*)", raw)
    if not m:
        raise LinkError("That doesn't look like a link.")
    url = m.group(1).rstrip(")】」,。\uff09\uff0c")  # also full-width ）and ，
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    if host in _SHORT_HOSTS:
        raise LinkError(
            "That's a short link. Open it in your browser and paste the full product link instead."
        )
    qs = parse_qs(parsed.query, keep_blank_values=False)
    found = _direct(host, parsed.path, qs)
    if found:
        return found
    if _depth < 3:
        for key in _WRAPPER_PARAMS:
            for value in qs.get(key, []):
                inner = unquote(value) if "%" in value else value
                try:
                    return parse_item_link(inner, _depth + 1)
                except LinkError:
                    continue
    raise LinkError("Mirra supports item links from Taobao, Tmall, Weidian, 1688 and KakoBuy.")


def try_parse(text: str | None) -> SourceLink | None:
    if not text:
        return None
    try:
        return parse_item_link(text)
    except LinkError:
        return None
