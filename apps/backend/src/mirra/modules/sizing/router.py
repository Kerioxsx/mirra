from __future__ import annotations

from fastapi import APIRouter, Depends

from mirra.core.errors import ErrorResponse
from mirra.core.ratelimit import rate_limit
from mirra.modules.sizing import cn
from mirra.modules.sizing.schemas import SizeAdvice, SizeAdviceRequest, SizeReading

router = APIRouter(prefix="/sizes", tags=["sizing"], responses={422: {"model": ErrorResponse}})


@router.post(
    "/advice",
    response_model=SizeAdvice,
    dependencies=[Depends(rate_limit("sizes", limit=120, window=60))],
)
async def size_advice(body: SizeAdviceRequest) -> SizeAdvice:
    """Read Chinese size labels (national codes such as 175/92A, letter sizes, waist inches or chi,
    EU-style shoe sizes) and suggest the one that fits the shopper's measurements. Estimates
    only; nothing is stored."""
    m = body.measurements
    advice = cn.advise(
        [x.strip() for x in body.labels if x.strip()][:30],
        body.kind,
        body.cut,
        cn.Measurements(
            height_cm=m.height_cm, chest_cm=m.chest_cm, waist_cm=m.waist_cm, foot_mm=m.foot_mm
        ),
    )
    return SizeAdvice(
        suggested=advice.label,
        reason=advice.reason,
        readings=[SizeReading.of(r) for r in advice.readings],
    )
