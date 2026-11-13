"""Shared fashion taxonomy. Source of truth for Python, the database and (via OpenAPI) TypeScript.

Adding a value: update the enum (and ``CATEGORY_SPECS`` for categories), then run
``pnpm gen:api`` so ``packages/shared-types`` picks it up; CI fails while generated files are stale.
Enums stored with a CHECK constraint (see ``db.types.str_enum``) also need a migration.
"""

from __future__ import annotations

from enum import StrEnum


class Category(StrEnum):
    # tops
    t_shirt = "t_shirt"
    shirt = "shirt"
    long_sleeve = "long_sleeve"
    tank_top = "tank_top"
    sweater = "sweater"
    hoodie = "hoodie"
    sweatshirt = "sweatshirt"
    zip_up = "zip_up"
    vest = "vest"
    jacket = "jacket"
    coat = "coat"
    # full body
    dress = "dress"
    jumpsuit = "jumpsuit"
    # bottoms
    jeans = "jeans"
    baggy_pants = "baggy_pants"
    cargo_pants = "cargo_pants"
    trousers = "trousers"
    sweatpants = "sweatpants"
    shorts = "shorts"
    skirt = "skirt"
    # footwear
    sneakers = "sneakers"
    boots = "boots"
    shoes = "shoes"
    sandals = "sandals"
    # headwear
    hat = "hat"
    cap = "cap"
    beanie = "beanie"
    # accessories
    glasses = "glasses"
    jewelry = "jewelry"
    scarf = "scarf"
    belt = "belt"
    watch = "watch"
    bag = "bag"
    accessory = "accessory"


class BodyRegion(StrEnum):
    head = "head"
    face = "face"
    neck = "neck"
    torso = "torso"
    full_body = "full_body"
    waist = "waist"
    legs = "legs"
    feet = "feet"
    wrist = "wrist"
    carry = "carry"


class Fidelity(StrEnum):
    """How faithfully a 3D garment represents a real product. Always shown to the user."""

    exact = "exact"
    approximate = "approximate"
    generic = "generic"


class ListingCondition(StrEnum):
    new = "new"
    new_with_tags = "new_with_tags"
    new_without_tags = "new_without_tags"
    used_like_new = "used_like_new"
    used_good = "used_good"
    used_fair = "used_fair"
    refurbished = "refurbished"
    unknown = "unknown"


class Authenticity(StrEnum):
    """Never upgraded from AI output alone."""

    brand_direct = "brand_direct"  # sold by the brand or an authorized retailer
    authenticated = "authenticated"  # marketplace authentication programme
    seller_claimed = "seller_claimed"  # seller says authentic, not verified
    unverified = "unverified"
    replica_advertised = "replica_advertised"  # listing itself says replica/rep/1:1


class Availability(StrEnum):
    in_stock = "in_stock"
    low_stock = "low_stock"
    out_of_stock = "out_of_stock"
    unknown = "unknown"


class IntegrationType(StrEnum):
    official_api = "official_api"
    affiliate_feed = "affiliate_feed"
    partner_api = "partner_api"
    demo = "demo"


class MarketplaceStatus(StrEnum):
    active = "active"
    planned = "planned"
    blocked = "blocked"  # no authorized access path yet
    disabled = "disabled"


class ClientKind(StrEnum):
    web = "web"
    desktop = "desktop"


class SearchQueryType(StrEnum):
    text = "text"
    image = "image"
    outfit = "outfit"
    brand = "brand"
    style = "style"
    natural_language = "natural_language"


class OutfitSource(StrEnum):
    manual = "manual"
    ai_stylist = "ai_stylist"


class WardrobeSource(StrEnum):
    upload = "upload"
    link_import = "link_import"
    purchase = "purchase"
    manual = "manual"


class RenderQuality(StrEnum):
    low = "low"
    medium = "medium"
    high = "high"


class ShoppingEventType(StrEnum):
    viewed = "viewed"
    clicked_out = "clicked_out"
    purchase_reported = "purchase_reported"


class UploadPurpose(StrEnum):
    wardrobe = "wardrobe"
    visual_search = "visual_search"
    avatar = "avatar"


class CategoryGroup(StrEnum):
    tops = "tops"
    outerwear = "outerwear"
    full_body = "full_body"
    bottoms = "bottoms"
    footwear = "footwear"
    headwear = "headwear"
    accessories = "accessories"


# Layer numbers within a body region (see docs/architecture/3d-asset-strategy.md).
LAYER_BASE = 10
LAYER_SHIRT = 20
LAYER_MID = 30
LAYER_OUTER = 40
LAYER_HEAVY = 50


# category -> (label, group, body region, default layer)
CATEGORY_SPECS: dict[Category, tuple[str, CategoryGroup, BodyRegion, int]] = {
    Category.t_shirt: ("T-shirts", CategoryGroup.tops, BodyRegion.torso, LAYER_BASE),
    Category.tank_top: ("Tank tops", CategoryGroup.tops, BodyRegion.torso, LAYER_BASE),
    Category.long_sleeve: ("Long sleeves", CategoryGroup.tops, BodyRegion.torso, LAYER_BASE),
    Category.shirt: ("Shirts", CategoryGroup.tops, BodyRegion.torso, LAYER_SHIRT),
    Category.sweater: ("Sweaters", CategoryGroup.tops, BodyRegion.torso, LAYER_MID),
    Category.hoodie: ("Hoodies", CategoryGroup.tops, BodyRegion.torso, LAYER_MID),
    Category.sweatshirt: ("Sweatshirts", CategoryGroup.tops, BodyRegion.torso, LAYER_MID),
    Category.vest: ("Vests", CategoryGroup.outerwear, BodyRegion.torso, LAYER_MID),
    Category.zip_up: ("Zip-ups", CategoryGroup.outerwear, BodyRegion.torso, LAYER_OUTER),
    Category.jacket: ("Jackets", CategoryGroup.outerwear, BodyRegion.torso, LAYER_OUTER),
    Category.coat: ("Coats", CategoryGroup.outerwear, BodyRegion.torso, LAYER_HEAVY),
    Category.dress: ("Dresses", CategoryGroup.full_body, BodyRegion.full_body, LAYER_BASE),
    Category.jumpsuit: ("Jumpsuits", CategoryGroup.full_body, BodyRegion.full_body, LAYER_BASE),
    Category.jeans: ("Jeans", CategoryGroup.bottoms, BodyRegion.legs, LAYER_BASE),
    Category.baggy_pants: ("Baggy pants", CategoryGroup.bottoms, BodyRegion.legs, LAYER_BASE),
    Category.cargo_pants: ("Cargo pants", CategoryGroup.bottoms, BodyRegion.legs, LAYER_BASE),
    Category.trousers: ("Trousers", CategoryGroup.bottoms, BodyRegion.legs, LAYER_BASE),
    Category.sweatpants: ("Sweatpants", CategoryGroup.bottoms, BodyRegion.legs, LAYER_BASE),
    Category.shorts: ("Shorts", CategoryGroup.bottoms, BodyRegion.legs, LAYER_BASE),
    Category.skirt: ("Skirts", CategoryGroup.bottoms, BodyRegion.legs, LAYER_BASE),
    Category.sneakers: ("Sneakers", CategoryGroup.footwear, BodyRegion.feet, LAYER_BASE),
    Category.boots: ("Boots", CategoryGroup.footwear, BodyRegion.feet, LAYER_BASE),
    Category.shoes: ("Shoes", CategoryGroup.footwear, BodyRegion.feet, LAYER_BASE),
    Category.sandals: ("Sandals", CategoryGroup.footwear, BodyRegion.feet, LAYER_BASE),
    Category.hat: ("Hats", CategoryGroup.headwear, BodyRegion.head, LAYER_BASE),
    Category.cap: ("Caps", CategoryGroup.headwear, BodyRegion.head, LAYER_BASE),
    Category.beanie: ("Beanies", CategoryGroup.headwear, BodyRegion.head, LAYER_BASE),
    Category.glasses: ("Glasses", CategoryGroup.accessories, BodyRegion.face, LAYER_BASE),
    Category.jewelry: ("Jewelry", CategoryGroup.accessories, BodyRegion.neck, LAYER_BASE),
    Category.scarf: ("Scarves", CategoryGroup.accessories, BodyRegion.neck, LAYER_SHIRT),
    Category.belt: ("Belts", CategoryGroup.accessories, BodyRegion.waist, LAYER_BASE),
    Category.watch: ("Watches", CategoryGroup.accessories, BodyRegion.wrist, LAYER_BASE),
    Category.bag: ("Bags", CategoryGroup.accessories, BodyRegion.carry, LAYER_BASE),
    Category.accessory: ("Accessories", CategoryGroup.accessories, BodyRegion.carry, LAYER_SHIRT),
}

# A full-body garment occupies these regions' base layers too.
FULL_BODY_COVERS: tuple[BodyRegion, ...] = (BodyRegion.torso, BodyRegion.legs)

assert set(CATEGORY_SPECS) == set(Category), "every category needs a spec"
