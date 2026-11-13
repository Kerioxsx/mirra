from mirra.core.contracts import taxonomy_contract
from mirra.core.taxonomy import BodyRegion, Category
from mirra.main import create_app


def test_taxonomy_contract_covers_every_category() -> None:
    contract = taxonomy_contract()
    assert {c["id"] for c in contract["categories"]} == {c.value for c in Category}
    regions = {r.value for r in BodyRegion}
    assert all(c["bodyRegion"] in regions for c in contract["categories"])


def test_openapi_documents_error_envelope_not_fastapi_default() -> None:
    spec = create_app().openapi()
    assert "HTTPValidationError" not in spec["components"]["schemas"]
    login = spec["paths"]["/api/v1/auth/login"]["post"]
    assert login["operationId"] == "auth_login"
    assert login["responses"]["422"]["content"]["application/json"]["schema"]["$ref"].endswith(
        "/ErrorResponse"
    )
