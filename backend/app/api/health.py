from fastapi import APIRouter

router = APIRouter(tags=["health"]) 


@router.get("/health", summary="Health check")
async def healthz() -> dict:
    return {"status": "ok"}

