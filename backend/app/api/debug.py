from fastapi import APIRouter
from app.core.config import get_settings

router = APIRouter(prefix="/debug", tags=["debug"])

@router.get("/api-keys")
async def debug_api_keys():
    """Debug endpoint to check API key configuration (shows only first/last 4 characters)"""
    settings = get_settings()
    
    def mask_key(key: str) -> str:
        if not key or len(key) < 8:
            return "***"
        return f"{key[:4]}...{key[-4:]}"
    
    return {
        "maps_key": mask_key(settings.clean_tomtom_maps_api_key),
        "traffic_key": mask_key(settings.clean_tomtom_traffic_api_key),
        "search_key": mask_key(settings.clean_tomtom_search_api_key),
        "stats_key": mask_key(settings.clean_tomtom_stats_api_key),
        "raw_maps_key": mask_key(settings.tomtom_maps_api_key),
        "raw_traffic_key": mask_key(settings.tomtom_traffic_api_key),
    }