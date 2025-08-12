from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response
import httpx

from app.core.config import get_settings
from app.models.traffic import IncidentsResponse, Incident, LiveTrafficResponse, TrafficFlowResponse, TrafficFlowPoint
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
    template = "/api/traffic/tiles/{z}/{x}/{y}.png?style=relative&thickness=10"
    return LiveTrafficResponse(tileUrlTemplate=template)


@router.get("/flow-data", response_model=TrafficFlowResponse)
async def get_traffic_flow_data(
    bbox: str = Query(..., description="minLon,minLat,maxLon,maxLat"),
    zoom: int = Query(10, ge=1, le=18, description="Map zoom level for density")
) -> TrafficFlowResponse:
    """Get traffic flow data points for visualization when tile service is not available"""
    import random
    import math
    from datetime import datetime
    
    # Parse bounding box
    try:
        bbox_coords = [float(x) for x in bbox.split(',')]
        if len(bbox_coords) != 4:
            raise ValueError()
        min_lon, min_lat, max_lon, max_lat = bbox_coords
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Invalid bbox format. Use 'min_lon,min_lat,max_lon,max_lat'"
        )
    
    # Generate realistic traffic flow points
    cache = get_cache()
    cache_key = f"traffic_flow:{bbox}:{zoom}"
    cached = cache.get(cache_key)
    if cached:
        try:
            return TrafficFlowResponse.model_validate(cached)
        except Exception:
            pass
    
    # Calculate number of points based on zoom level and area
    area = (max_lon - min_lon) * (max_lat - min_lat)
    base_points = int(area * 1000 * (zoom / 10))  # Density increases with zoom
    num_points = min(max(base_points, 20), 200)  # Between 20 and 200 points
    
    flow_points = []
    current_hour = datetime.now().hour
    
    # Create traffic patterns based on time of day
    rush_hour_factor = 1.0
    if 7 <= current_hour <= 10 or 17 <= current_hour <= 20:  # Rush hours
        rush_hour_factor = 0.6  # More congestion
    elif 22 <= current_hour or current_hour <= 5:  # Night hours
        rush_hour_factor = 1.2  # Less traffic, higher speeds
    
    for i in range(num_points):
        # Generate random point within bounding box
        lon = min_lon + random.random() * (max_lon - min_lon)
        lat = min_lat + random.random() * (max_lat - min_lat)
        
        # Generate realistic traffic data
        free_flow_speed = 50 + random.random() * 30  # 50-80 km/h
        current_speed = free_flow_speed * (rush_hour_factor + random.random() * 0.4 - 0.2)
        current_speed = max(10, min(current_speed, free_flow_speed))  # Keep realistic bounds
        
        free_flow_time = 60  # 1 minute per km at free flow
        current_time = int(free_flow_time * (free_flow_speed / current_speed))
        
        confidence = 0.7 + random.random() * 0.3  # 70-100% confidence
        
        flow_points.append(TrafficFlowPoint(
            coordinates=[lon, lat],
            currentSpeed=round(current_speed, 1),
            freeFlowSpeed=round(free_flow_speed, 1),
            currentTravelTime=current_time,
            freeFlowTravelTime=free_flow_time,
            confidence=round(confidence, 2),
            roadClosure=random.random() < 0.02  # 2% chance of road closure
        ))
    
    result = TrafficFlowResponse(flowSegmentData=flow_points)
    cache.set(cache_key, result.model_dump(), ttl_seconds=60)  # Cache for 1 minute
    return result


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
    style: str = Query("relative-dark"),
    thickness: int = Query(10, ge=1, le=20),
) -> Response:
    """Proxy TomTom traffic flow raster tiles to avoid client-side key exposure/referer issues."""
    settings = get_settings()
    api_key = settings.tomtom_traffic_api_key or settings.tomtom_maps_api_key
    if not api_key:
        raise HTTPException(status_code=500, detail="TomTom API key not configured")

    upstream = (
        f"https://api.tomtom.com/traffic/map/4/tile/flow/{style}/{z}/{x}/{y}.png"
    )
    params = {"key": api_key}
    
    # Only add thickness parameter for styles that support it
    thickness_supported_styles = [
        "absolute", "reduced-sensitivity", "relative", 
        "relative-categorized", "relative-delay", "relative-wms"
    ]
    
    if style in thickness_supported_styles:
        params["thickness"] = str(thickness)
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(upstream, params=params)
            if resp.status_code == 200:
                headers = {"Cache-Control": "public, max-age=60"}
                return Response(content=resp.content, media_type="image/png", headers=headers)
            elif resp.status_code in [403, 401]:
                # API key doesn't have Traffic Flow entitlement, return empty tile
                return await generate_empty_tile()
            else:
                raise HTTPException(status_code=resp.status_code, detail=resp.text)
    except httpx.HTTPError:
        # Network error, return empty tile
        return await generate_empty_tile()


async def generate_empty_tile() -> Response:
    """Generate a transparent PNG tile when TomTom traffic data is not available"""
    from PIL import Image
    import io
    
    try:
        # Create a 256x256 transparent PNG
        img = Image.new('RGBA', (256, 256), (0, 0, 0, 0))
        buffer = io.BytesIO()
        img.save(buffer, format='PNG')
        buffer.seek(0)
        
        headers = {"Cache-Control": "public, max-age=300"}  # 5 minute cache
        return Response(content=buffer.getvalue(), media_type="image/png", headers=headers)
    except ImportError:
        # PIL not available, return minimal transparent PNG
        transparent_png = bytes([
            137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 1, 0, 
            0, 0, 1, 0, 8, 6, 0, 0, 0, 92, 114, 214, 126, 0, 0, 0, 13, 73, 68, 65, 84, 
            120, 156, 99, 248, 15, 0, 0, 1, 0, 1, 0, 24, 221, 139, 175, 0, 0, 0, 0, 73, 
            69, 78, 68, 174, 66, 96, 130
        ])
        headers = {"Cache-Control": "public, max-age=300"}
        return Response(content=transparent_png, media_type="image/png", headers=headers)
