"""Add the style_alternative authenticity value

Taobao and similar marketplaces carry many "same style" (同款) listings that don't claim to be
the brand. They are legitimate alternatives and must be distinguishable from replicas.

Revision ID: 0002
Revises: 0001
Create Date: 2026-11-13
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

OLD = ("brand_direct", "authenticated", "seller_claimed", "unverified", "replica_advertised")
NEW = (
    "brand_direct",
    "authenticated",
    "seller_claimed",
    "unverified",
    "style_alternative",
    "replica_advertised",
)


def _check(values: tuple[str, ...]) -> str:
    return "authenticity IN (" + ", ".join(f"'{v}'" for v in values) + ")"


def upgrade() -> None:
    op.drop_constraint(
        op.f("ck_marketplace_listings_authenticity"), "marketplace_listings", type_="check"
    )
    op.create_check_constraint("authenticity", "marketplace_listings", _check(NEW))


def downgrade() -> None:
    op.execute(
        "UPDATE marketplace_listings SET authenticity = 'unverified' "
        "WHERE authenticity = 'style_alternative'"
    )
    op.drop_constraint(
        op.f("ck_marketplace_listings_authenticity"), "marketplace_listings", type_="check"
    )
    op.create_check_constraint("authenticity", "marketplace_listings", _check(OLD))
