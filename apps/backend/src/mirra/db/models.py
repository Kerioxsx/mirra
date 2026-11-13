"""Import every model so ``Base.metadata`` is complete (Alembic autogenerate, tests)."""

from mirra.db.base import Base
from mirra.modules.auth.models import AuthSession
from mirra.modules.avatars.models import Avatar
from mirra.modules.garments.models import GarmentAsset, GarmentCompatibility
from mirra.modules.marketplaces.models import Marketplace, MarketplaceListing, PriceHistory, Seller
from mirra.modules.outfits.models import Outfit, OutfitItem
from mirra.modules.products.models import Product, ProductEmbedding, ProductImage
from mirra.modules.shopping.models import SavedProduct, SearchHistory, ShoppingEvent
from mirra.modules.uploads.models import Upload
from mirra.modules.users.models import User, UserPreferences
from mirra.modules.wardrobe.models import WardrobeItem

__all__ = [
    "AuthSession",
    "Avatar",
    "Base",
    "GarmentAsset",
    "GarmentCompatibility",
    "Marketplace",
    "MarketplaceListing",
    "Outfit",
    "OutfitItem",
    "PriceHistory",
    "Product",
    "ProductEmbedding",
    "ProductImage",
    "SavedProduct",
    "SearchHistory",
    "Seller",
    "ShoppingEvent",
    "Upload",
    "User",
    "UserPreferences",
    "WardrobeItem",
]
