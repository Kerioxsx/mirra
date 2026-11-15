"""Photo search: read the garments in a shopper's photo, then search for them.

With ``MIRRA_ANTHROPIC_API_KEY`` set, Claude reads the photo (category, colours, details and a
short English query) through structured output. Without it, the app still works: the browser
extracts the dominant colours itself and the shopper picks the category (the ``hint``), and
marketplaces with their own image search (eBay) get the photo. Photos are never stored.
"""

from __future__ import annotations

import base64
import logging
from typing import Literal, Protocol

import anthropic
from pydantic import BaseModel, Field

from mirra.core.taxonomy import Category

log = logging.getLogger(__name__)

MAX_PHOTO_BYTES = 5 * 1024 * 1024
MediaType = Literal["image/jpeg", "image/png", "image/webp", "image/gif"]

BASIC_COLOURS = (
    "black, white, grey, navy, blue, light blue, green, olive, beige, cream, brown, "
    "red, burgundy, pink, purple, yellow, orange"
)


def sniff(data: bytes) -> MediaType | None:
    """The image type from its first bytes (never trust the declared content type)."""
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    return None


class GarmentReading(BaseModel):
    category: Category | None = Field(description="The closest Mirra category, or null")
    colors: list[str] = Field(description="Main colours, simple names, most dominant first")
    pattern: str | None = Field(description="e.g. solid, striped, plaid, floral, graphic print")
    details: list[str] = Field(description="Visible details, e.g. hood, zip, cropped, wide leg")
    query: str = Field(description="What a shopper would type to find it, 3 to 8 English words")


class PhotoReading(BaseModel):
    is_clothing: bool = Field(description="False when the photo shows no clothing or footwear")
    garments: list[GarmentReading] = Field(description="Most prominent garment first, at most 4")


class Describer(Protocol):
    async def describe(self, data: bytes, media_type: MediaType) -> PhotoReading | None: ...


SYSTEM = f"""You read clothing in a shopper's photo for a fashion search engine.

List the garments, shoes and accessories you can see, the most prominent first, at most four.
For each one give:
- category: the closest of {", ".join(c.value for c in Category)}; null if none fits
- colors: simple colour names ({BASIC_COLOURS}), most dominant first
- pattern and visible details (hood, zip, collar, cropped, oversized, wide leg, chunky sole ...)
- query: the 3 to 8 English words a shopper would type to find it, e.g. "olive cropped puffer vest"

Name a brand in the query only when its logo or wordmark is clearly legible in the photo. Describe
the clothes only, never the person wearing them. If the photo shows no clothing or footwear, set
is_clothing to false and return no garments."""


class ClaudeDescriber:
    """Reads a photo with Claude (vision + structured output). Returns None when it can't."""

    def __init__(self, api_key: str, model: str, timeout: float = 25.0) -> None:
        self._client = anthropic.AsyncAnthropic(api_key=api_key, timeout=timeout, max_retries=1)
        self.model = model

    async def describe(self, data: bytes, media_type: MediaType) -> PhotoReading | None:
        try:
            response = await self._client.beta.messages.parse(
                model=self.model,
                max_tokens=8000,
                # a simple reading: little thinking needed
                output_config={"effort": "low"},
                # on a policy decline, the API retries on a fallback model in the same call
                betas=["server-side-fallback-2026-07-01"],
                fallbacks="default",
                system=SYSTEM,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image",
                                "source": {
                                    "type": "base64",
                                    "media_type": media_type,
                                    "data": base64.standard_b64encode(data).decode("ascii"),
                                },
                            },
                            {"type": "text", "text": "Read the clothing in this photo."},
                        ],
                    }
                ],
                output_format=PhotoReading,
            )
        except anthropic.RateLimitError:
            log.warning("photo reading rate limited")
            return None
        except anthropic.APIStatusError as exc:
            log.warning("photo reading failed: %s %s", exc.status_code, exc.message)
            return None
        except anthropic.APIConnectionError as exc:
            log.warning("photo reading unreachable: %s", type(exc).__name__)
            return None
        if response.stop_reason == "refusal":
            log.info("photo reading declined")
            return None
        reading = response.parsed_output
        if reading is None:
            return None
        reading.garments = reading.garments[:4]
        return reading

    async def aclose(self) -> None:
        await self._client.close()
