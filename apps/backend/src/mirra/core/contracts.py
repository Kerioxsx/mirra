"""Machine-readable contracts shared with the frontend (written by ``python -m mirra.export``)."""

from __future__ import annotations

from typing import Any

from mirra.core.taxonomy import (
    CATEGORY_SPECS,
    FULL_BODY_COVERS,
    LAYER_BASE,
    LAYER_HEAVY,
    LAYER_MID,
    LAYER_OUTER,
    LAYER_SHIRT,
    BodyRegion,
    CategoryGroup,
)


def taxonomy_contract() -> dict[str, Any]:
    return {
        "categories": [
            {
                "id": cat.value,
                "label": label,
                "group": group.value,
                "bodyRegion": region.value,
                "defaultLayer": layer,
            }
            for cat, (label, group, region, layer) in CATEGORY_SPECS.items()
        ],
        "groups": [g.value for g in CategoryGroup],
        "bodyRegions": [r.value for r in BodyRegion],
        "fullBodyCovers": [r.value for r in FULL_BODY_COVERS],
        "layers": {
            "base": LAYER_BASE,
            "shirt": LAYER_SHIRT,
            "mid": LAYER_MID,
            "outer": LAYER_OUTER,
            "heavy": LAYER_HEAVY,
        },
    }
