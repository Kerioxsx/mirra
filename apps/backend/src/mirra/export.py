"""Write the API contracts consumed by the frontend.

    python -m mirra.export <out_dir>

Produces ``openapi.json`` and ``taxonomy.json``. ``scripts/gen-api-types.mjs`` turns the first
into TypeScript and copies the second into ``packages/shared-types``.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from mirra.core.contracts import taxonomy_contract
from mirra.main import create_app


def main(out_dir: str) -> None:
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    (out / "openapi.json").write_text(json.dumps(create_app().openapi(), indent=2) + "\n")
    (out / "taxonomy.json").write_text(json.dumps(taxonomy_contract(), indent=2) + "\n")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else ".")
