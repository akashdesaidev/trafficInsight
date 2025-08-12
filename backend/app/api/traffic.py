from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response
import httpx

from app.core.config import get_settings
from app.models.traffic import IncidentsResponse, Incident, LiveTrafficResponse
from app.services.cache import get_cache

router = APIRouter(prefix="/traffic", tags=["traffic"])


@router.get("/live-traffic", response_model=LiveTrafficResponse)
async def get_live_traffic() -> LiveTrafficResponse:
    settings = get_settings()
    api_key = settings.tomtom_traffic_api_key or settings.tomtom_maps_api_key
    if not api_key:
        raise HTTPException(status_code=500, detail="TomTom API key not configured")
    # Using raster tiles for simple overlay
    # Prefer backend proxy to avoid browser 403 due to referer/domain restrictions
    template = "/api/traffic/tiles/{z}/{x}/{y}.png?style=relative/dark&thickness=3"
    return LiveTrafficResponse(tileUrlTemplate=template)


@router.get("/traffic-incidents", response_model=IncidentsResponse)
async def get_traffic_incidents(
    bbox: str = Query(..., description="minLon,minLat,maxLon,maxLat"),
    language: str = Query("en-GB"),
    timeValidityFilter: str = Query("present"),
) -> IncidentsResponse:
    settings = get_settings()
    api_key = settings.tomtom_traffic_api_key or settings.tomtom_maps_api_key
    if not api_key:
        raise HTTPException(status_code=500, detail="TomTom API key not configured")

    cache = get_cache()
    cache_key = f"incidents:{bbox}:{language}:{timeValidityFilter}"
    cached = cache.get(cache_key)
    if cached:
        try:
            return IncidentsResponse.model_validate(cached)
        except Exception:
            pass

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.get(
                "https://api.tomtom.com/traffic/services/5/incidentDetails",
                params={
                    "key": api_key,
                    "bbox": bbox,
                    "language": language,
                    "timeValidityFilter": timeValidityFilter,
                    "fields": "{incidents{type,severity,geometry{type,coordinates},properties{id,description,startTime,endTime}}}",
                },
            )
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

        if resp.status_code == 403:
            # Key likely lacks Incidents entitlement. Return empty list gracefully.
            return IncidentsResponse(incidents=[])
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail=resp.text)
        data = resp.json()

    incidents_raw = data.get("incidents") or data.get("incidents").get("incidents") if isinstance(data.get("incidents"), dict) else data.get("incidents")
    incidents_list = []
    for item in incidents_raw or []:
        props = item.get("properties", {})
        geometry = item.get("geometry", {})
        incidents_list.append(
            Incident(
                id=str(props.get("id", "")),
                type=item.get("type"),
                severity=item.get("severity"),
                description=props.get("description"),
                startTime=props.get("startTime"),
                endTime=props.get("endTime"),
                geometry=geometry if geometry else None,
            ).model_dump()
        )

    result = IncidentsResponse(incidents=incidents_list)
    cache.set(cache_key, result.model_dump(), ttl_seconds=120)
    return result


@router.get("/tiles/{z}/{x}/{y}.png")
async def get_traffic_tile(
    z: int,
    x: int,
    y: int,
    style: str = Query("relative/dark"),
    thickness: int = Query(3, ge=1, le=6),
) -> Response:
    """Proxy TomTom traffic flow raster tiles to avoid client-side key exposure/referer issues."""
    settings = get_settings()
    api_key = settings.tomtom_traffic_api_key or settings.tomtom_maps_api_key
    if not api_key:
        raise HTTPException(status_code=500, detail="TomTom API key not configured")

    upstream = (
        f"https://api.tomtom.com/traffic/map/4/tile/flow/{style}/{z}/{x}/{y}.png"
    )
    params = {"key": api_key, "thickness": str(thickness)}
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(upstream, params=params)
        if resp.status_code != 200:
            # pass through status if unauthorized/forbidden for clarity
            raise HTTPException(status_code=resp.status_code, detail=resp.text)
        headers = {"Cache-Control": "public, max-age=60"}
        return Response(content=resp.content, media_type="image/png", headers=headers)
