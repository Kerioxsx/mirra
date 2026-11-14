from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from mirra.modules.listings.schemas import ListingSummary


class SaveRequest(BaseModel):
    listing_id: uuid.UUID


class SavedItem(BaseModel):
    listing_id: uuid.UUID
    saved_at: datetime
    listing: ListingSummary


class EventRequest(BaseModel):
    event: Literal["viewed", "clicked_out"]
    listing_id: uuid.UUID


class SearchEntry(BaseModel):
    query: str
    result_count: int | None
    created_at: datetime


class EventEntry(BaseModel):
    event: Literal["viewed", "clicked_out", "purchase_reported"]
    created_at: datetime
    listing: ListingSummary


class ShoppingHistory(BaseModel):
    searches: list[SearchEntry]
    events: list[EventEntry]
