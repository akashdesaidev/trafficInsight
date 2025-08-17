from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response
import httpx
import logging

from app.core.config import get_settings
from app.models.traffic import IncidentsResponse, Incident, IncidentGeometry, LiveTrafficResponse, TrafficFlowResponse, TrafficFlowPoint, FlowSegmentResponse, FlowSegmentData, FlowSegmentCoordinates, Coordinate
from app.services.cache import get_cache
from app.services.live_chokepoints import LiveChokepointService

router = APIRouter(prefix="/traffic", tags=["traffic"])
logger = logging.getLogger(__name__)

# Default Bangalore bounding box (minLon, minLat, maxLon, maxLat)
BANGALORE_BBOX = [77.6234, 12.9037, 77.6625, 12.9247]


@router.get("/live-traffic", response_model=LiveTrafficResponse)
async def get_live_traffic() -> LiveTrafficResponse:
    settings = get_settings()
    api_key = settings.clean_tomtom_traffic_api_key or settings.clean_tomtom_maps_api_key
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
            coordinate=Coordinate(latitude=lat, longitude=lon),
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
    api_key = settings.clean_tomtom_traffic_api_key or settings.clean_tomtom_maps_api_key
    if not api_key:
        raise HTTPException(status_code=500, detail="TomTom API key not configured")

    # Parse bbox to check area
    try:
        bbox_coords = [float(x) for x in bbox.split(',')]
        if len(bbox_coords) != 4:
            raise ValueError()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid bbox format. Use 'min_lon,min_lat,max_lon,max_lat'")

    # Check if bbox is too large and use service's splitting logic
    service = LiveChokepointService()
    area_km2 = service._calculate_bbox_area_km2(bbox_coords)
    
    if area_km2 > 10000:
        # Use service's incident fetching with splitting
        try:
            incidents_data = await service._fetch_incidents(bbox_coords)
            incidents_list = []
            for item in incidents_data or []:
                props = item.get("properties", {})
                geometry_raw = item.get("geometry", {})
                
                # Process geometry consistently
                geometry = None
                if geometry_raw:
                    coords = geometry_raw.get("coordinates", [])
                    if coords and len(coords) >= 2:
                        try:
                            if isinstance(coords[0], (int, float)) and isinstance(coords[1], (int, float)):
                                geometry = IncidentGeometry(
                                    type="Point",
                                    coordinates=[float(coords[0]), float(coords[1])]
                                )
                        except (ValueError, TypeError, IndexError) as e:
                            logger.warning(f"Error parsing geometry for large area incident {props.get('id', 'unknown')}: {e}")
                
                incidents_list.append(
                    Incident(
                        id=str(props.get("id", "")),
                        type=item.get("type"),
                        severity=item.get("severity"),
                        description=props.get("description"),
                        startTime=props.get("startTime"),
                        endTime=props.get("endTime"),
                        geometry=geometry,
                    )
                )
            return IncidentsResponse(incidents=incidents_list)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Failed to fetch incidents for large area: {exc}")

    # Original single-bbox logic for smaller areas
    cache = get_cache()
    cache_key = f"incidents:{bbox}:{language}:{timeValidityFilter}"
    cached = cache.get(cache_key)
    if cached:
        try:
            return IncidentsResponse.model_validate(cached)
        except Exception:
            pass

    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            resp = await client.get(
                "https://api.tomtom.com/traffic/services/5/incidentDetails",
                params={
                    "key": api_key,
                    "bbox": bbox,
                    "language": language,
                    "timeValidityFilter": timeValidityFilter,
                    "fields": "{incidents{type,geometry{type,coordinates},properties{id,iconCategory,magnitudeOfDelay,events{description,code,iconCategory},startTime,endTime,from,to,length,delay,roadNumbers,timeValidity,probabilityOfOccurrence,numberOfReports,lastReportTime}}}",
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

    incidents_raw = data.get("incidents", [])
    incidents_list = []
    for item in incidents_raw or []:
        props = item.get("properties", {})
        geometry_raw = item.get("geometry", {})
        
        # Process geometry to handle different coordinate structures
        geometry = None
        if geometry_raw:
            coords = geometry_raw.get("coordinates", [])
            geom_type = geometry_raw.get("type", "Point")
            incident_id = props.get("id", "unknown")
            
            try:
                # For LineString, keep the full coordinate array; for Point, use as-is
                if geom_type == "Point" and coords and len(coords) >= 2:
                    # Point: [lon, lat]
                    if isinstance(coords[0], (int, float)) and isinstance(coords[1], (int, float)):
                        geometry = IncidentGeometry(
                            type=geom_type,
                            coordinates=[float(coords[0]), float(coords[1])]
                        )
                    else:
                        logger.warning(f"Invalid Point coordinates for incident {incident_id}: {coords}")
                elif geom_type == "LineString" and coords:
                    # LineString: [[lon, lat], [lon, lat], ...] -> use first point for our model
                    if isinstance(coords, list) and len(coords) > 0:
                        first_coord = coords[0] if isinstance(coords[0], list) else coords
                        if isinstance(first_coord, list) and len(first_coord) >= 2:
                            if isinstance(first_coord[0], (int, float)) and isinstance(first_coord[1], (int, float)):
                                geometry = IncidentGeometry(
                                    type="Point",  # Convert to Point for consistency
                                    coordinates=[float(first_coord[0]), float(first_coord[1])]
                                )
                            else:
                                logger.warning(f"Invalid LineString coordinate values for incident {incident_id}: {first_coord}")
                        else:
                            logger.warning(f"Invalid LineString coordinate structure for incident {incident_id}: {first_coord}")
                    else:
                        logger.warning(f"Invalid LineString coordinates for incident {incident_id}: {coords}")
                else:
                    logger.warning(f"Unsupported geometry type '{geom_type}' for incident {incident_id}")
            except (ValueError, TypeError, IndexError) as e:
                logger.error(f"Error parsing geometry for incident {incident_id}: {e}")
                geometry = None
        
        # Extract description from events array (first event's description)
        description = None
        events = props.get("events", [])
        if events and len(events) > 0:
            description = events[0].get("description")
        
        # Map iconCategory to severity for backward compatibility
        icon_category = props.get("iconCategory")
        severity_mapping = {
            0: "unknown", 1: "major", 2: "minor", 3: "major", 4: "minor", 
            5: "major", 6: "moderate", 7: "moderate", 8: "major", 9: "minor", 
            10: "minor", 11: "major", 14: "moderate"
        }
        severity = severity_mapping.get(icon_category, "unknown") if icon_category is not None else None
        
        incidents_list.append(
            Incident(
                id=str(props.get("id", "")),
                type=item.get("type", "Feature"),
                severity=severity,
                description=description,
                startTime=props.get("startTime"),
                endTime=props.get("endTime"),
                geometry=geometry,
            )
        )

    result = IncidentsResponse(incidents=incidents_list)
    cache.set(cache_key, result.model_dump(), ttl_seconds=120)
    return result


@router.get("/live-chokepoints")
async def get_live_chokepoints(
    z: int = Query(13, ge=0, le=22),
    eps_m: int = Query(150, ge=50, le=1000),  # Optimized for Bangalore's dense urban areas
    min_samples: int = Query(4, ge=1, le=20),  # Increased for major corridors
    jf_min: float = Query(4.0, ge=0.0, le=10.0),
    incident_radius_m: int = Query(100, ge=0, le=1000),
    include_geocode: bool = Query(False),
):
    """Live chokepoint detection using vector flow tiles (jamFactor) and DBSCAN.
    Always uses Bangalore city bounding box on the server side; no bbox input required."""

    # Force Bangalore bbox regardless of client input
    bbox_coords = BANGALORE_BBOX

    service = LiveChokepointService()
    try:
        result = await service.get_live_chokepoints(
            bbox=bbox_coords,
            z=z,
            eps_m=eps_m,
            min_samples=min_samples,
            jf_min=jf_min,
            incident_radius_m=incident_radius_m,
            include_geocode=include_geocode,
        )
        return result
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to compute live chokepoints: {exc}")


@router.get("/vector-probe")
async def vector_probe(
    bbox: str = Query(..., description="minLon,minLat,maxLon,maxLat"),
    z: int = Query(13, ge=0, le=22),
    max_samples: int = Query(10, ge=1, le=100),
):
    """Fetch vector flow tiles for a bbox and report sample feature properties.
    Helps verify availability of jamFactor/currentSpeed/freeFlowSpeed in tiles.
    """
    try:
        bbox_coords = [float(x) for x in bbox.split(',')]
        if len(bbox_coords) != 4:
            raise ValueError()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid bbox format. Use 'min_lon,min_lat,max_lon,max_lat'")

    svc = LiveChokepointService()
    min_lon, min_lat, max_lon, max_lat = bbox_coords
    if z < 12:
        z = 12
    tiles = svc._tiles_for_bbox(min_lon, min_lat, max_lon, max_lat, z)
    if len(tiles) > 32:
        # reduce zoom if too many tiles
        z = max(12, z - 1)
        tiles = svc._tiles_for_bbox(min_lon, min_lat, max_lon, max_lat, z)
    try:
        features, used_style = await svc._fetch_decode_tiles_multi(tiles, z)  # type: ignore[attr-defined]
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Tile fetch/decode failed: {exc}")

    feature_count = len(features)
    sample_props = []
    jam_hits = 0
    speed_hits = 0
    keys_union = set()
    for f in features[:max_samples]:
        props = f.get("properties", {}) or {}
        sample_props.append(props)
        keys_union.update(props.keys())
        # jam-like
        for k, v in props.items():
            kl = str(k).lower()
            if "jam" in kl or kl in ("jf", "jam_factor"):
                jam_hits += 1
                break
        # speed-like
        if any(kk in ("currentSpeed", "current_speed", "freeFlowSpeed", "free_flow_speed") for kk in props.keys()):
            speed_hits += 1

    return {
        "zoom": z,
        "style": used_style,
        "tile_count": len(tiles),
        "feature_count": feature_count,
        "keys_sample": list(keys_union)[:25],
        "jam_like_in_samples": jam_hits,
        "speed_like_in_samples": speed_hits,
        "sample_properties": sample_props,
    }



@router.get("/flow-segment", response_model=FlowSegmentResponse)
async def flow_segment(
    lat: float = Query(...),
    lon: float = Query(...),
    style: str = Query("absolute", pattern="^(absolute|relative)$"),
    resolution: int = Query(10, ge=1, le=100),
    unit: str = Query("KMPH", pattern="^(KMPH|MPH)$"),
) -> FlowSegmentResponse:
    """Get TomTom Flow Segment Data (structured) for a single point.
    Example: /api/traffic/flow-segment?lat=12.97&lon=77.59&style=absolute&resolution=10&unit=KMPH
    """
    settings = get_settings()
    api_key = settings.clean_tomtom_traffic_api_key or settings.clean_tomtom_maps_api_key
    if not api_key:
        raise HTTPException(status_code=500, detail="TomTom API key not configured")
    
    upstream = f"https://api.tomtom.com/traffic/services/4/flowSegmentData/{style}/{resolution}/json"
    params = {"key": api_key, "point": f"{lat},{lon}", "unit": unit}
    
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.get(upstream, params=params)
            if resp.status_code != 200:
                raise HTTPException(status_code=resp.status_code, detail=resp.text)
            
            # Parse TomTom response
            tomtom_data = resp.json()
            
            # Extract flow segment data from TomTom response
            if "flowSegmentData" not in tomtom_data:
                raise HTTPException(status_code=502, detail="Invalid TomTom response structure")
            
            flow_data = tomtom_data["flowSegmentData"]
            
            # Parse coordinates
            coordinates = []
            if "coordinates" in flow_data and "coordinate" in flow_data["coordinates"]:
                for coord in flow_data["coordinates"]["coordinate"]:
                    coordinates.append(Coordinate(
                        latitude=coord.get("latitude", 0.0),
                        longitude=coord.get("longitude", 0.0)
                    ))
            
            # Create structured response
            structured_data = FlowSegmentData(
                frc=flow_data.get("frc", "FRC0"),
                currentSpeed=flow_data.get("currentSpeed", 0.0),
                freeFlowSpeed=flow_data.get("freeFlowSpeed", 0.0),
                currentTravelTime=flow_data.get("currentTravelTime", 0),
                freeFlowTravelTime=flow_data.get("freeFlowTravelTime", 0),
                confidence=flow_data.get("confidence", 0.0),
                roadClosure=flow_data.get("roadClosure", False),
                coordinates=FlowSegmentCoordinates(coordinate=coordinates)
            )
            
            return FlowSegmentResponse(flowSegmentData=structured_data)
            
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error processing flow segment data: {str(exc)}")


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
    api_key = settings.clean_tomtom_traffic_api_key or settings.clean_tomtom_maps_api_key
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
        async with httpx.AsyncClient(timeout=60.0) as client:
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
