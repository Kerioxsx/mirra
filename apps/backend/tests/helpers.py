from datetime import date
from decimal import Decimal

from mirra.modules.pricing.fx import FxRates

# Illustrative test rates (units per EUR), not real market data.
FIXED_RATES = FxRates(
    as_of=date(2026, 11, 12),
    per_eur={
        "EUR": Decimal(1),
        "USD": Decimal("1.08"),
        "CNY": Decimal("7.80"),
        "GBP": Decimal("0.84"),
        "HKD": Decimal("8.40"),
        "SGD": Decimal("1.45"),
    },
)
