from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from .. import models
from ..db import get_session


router = APIRouter(tags=["artifacts"])


@router.get("/artifacts/{artifact_id}")
async def download_artifact(
    artifact_id: str,
    session: AsyncSession = Depends(get_session),
) -> FileResponse:
    artifact = await session.get(models.Artifact, artifact_id)
    if not artifact:
        raise HTTPException(status_code=404, detail=f"Artifact {artifact_id} not found")

    path = Path(artifact.storage_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Artifact file missing for {artifact_id}")

    return FileResponse(path, filename=artifact.filename)
