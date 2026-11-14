from __future__ import annotations

import uuid

from fastapi import APIRouter, Response, status

from mirra.core.errors import ErrorResponse
from mirra.modules.auth.deps import CurrentUser, SessionDep
from mirra.modules.outfits import service
from mirra.modules.outfits.schemas import OutfitIn, OutfitOut, OutfitRename

router = APIRouter(
    prefix="/outfits",
    tags=["outfits"],
    responses={
        401: {"model": ErrorResponse},
        404: {"model": ErrorResponse},
        422: {"model": ErrorResponse},
    },
)


@router.get("", response_model=list[OutfitOut])
async def list_outfits(user: CurrentUser, session: SessionDep) -> list[OutfitOut]:
    return [await service.to_out(session, o) for o in await service.list_owned(session, user.id)]


@router.post("", response_model=OutfitOut, status_code=status.HTTP_201_CREATED)
async def create_outfit(body: OutfitIn, user: CurrentUser, session: SessionDep) -> OutfitOut:
    """Save a look. Products must be listings Mirra has stored (from search)."""
    return await service.to_out(session, await service.create(session, user.id, body))


@router.get("/{outfit_id}", response_model=OutfitOut)
async def get_outfit(outfit_id: uuid.UUID, user: CurrentUser, session: SessionDep) -> OutfitOut:
    return await service.to_out(session, await service.get_owned(session, user.id, outfit_id))


@router.patch("/{outfit_id}", response_model=OutfitOut)
async def rename_outfit(
    outfit_id: uuid.UUID, body: OutfitRename, user: CurrentUser, session: SessionDep
) -> OutfitOut:
    outfit = await service.get_owned(session, user.id, outfit_id)
    outfit.name = body.name
    await session.commit()
    return await service.to_out(session, await service.get_owned(session, user.id, outfit_id))


@router.delete("/{outfit_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_outfit(outfit_id: uuid.UUID, user: CurrentUser, session: SessionDep) -> Response:
    outfit = await service.get_owned(session, user.id, outfit_id)
    await session.delete(outfit)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
