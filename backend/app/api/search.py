from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query, Body
import httpx

from app.core.config import get_settings
from app.models.search import SearchResponse, SearchResult, RouteRequest, RouteResponse, RouteSummary
from app.services.cache import get_cache

router = APIRouter(prefix="/search", tags=["search"])


@router.get("/autocomplete", response_model=SearchResponse)
async def search_autocomplete(
    q: str = Query(..., min_length=2, description="Search query"),
    limit: int = Query(10, ge=1, le=50, description="Number of results"),
    countrySet: str = Query("IN", description="Country filter"),
    language: str = Query("en-GB", description="Response language"),
) -> SearchResponse:
    """Search for locations with autocomplete functionality using TomTom Search API."""
    settings = get_settings()
    api_key = settings.clean_tomtom_search_api_key or settings.clean_tomtom_maps_api_key
    if not api_key:
        raise HTTPException(status_code=500, detail="TomTom Search API key not configured")

    cache = get_cache()
    cache_key = f"search:{q}:{limit}:{countrySet}:{language}"
    cached = cache.get(cache_key)
    if cached:
        try:
            return SearchResponse.model_validate(cached)
        except Exception:
            pass

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.get(
                "https://api.tomtom.com/search/2/search/{query}.json".format(query=q),
                params={
                    "key": api_key,
                    "limit": limit,
                    "countrySet": countrySet,
                    "language": language,
                    "typeahead": "true",
                    "idxSet": "POI,Addr,Geo",
                },
            )
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

        if resp.status_code == 403:
            # API key lacks Search entitlement, return empty results gracefully
            return SearchResponse(results=[])
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail=resp.text)
        
        data = resp.json()

    # Parse TomTom search response
    results = []
    for item in data.get("results", []):
        address = item.get("address", {})
        position = item.get("position", {})
        
        result = SearchResult(
            id=item.get("id", ""),
            address=address.get("freeformAddress", ""),
            position_lat=position.get("lat", 0.0),
            position_lon=position.get("lon", 0.0),
            score=item.get("score", 0.0),
            country=address.get("country", ""),
            countryCode=address.get("countryCode", ""),
            municipality=address.get("municipality", ""),
            poi=item.get("poi", {}).get("name") if item.get("poi") else None,
        )
        results.append(result)

    response = SearchResponse(results=results)
    
    # Cache for 5 minutes
    cache.set(cache_key, response.model_dump(), ttl_seconds=300)
    return response


@router.get("/geocode", response_model=SearchResponse)
async def geocode_reverse(
    lat: float = Query(..., description="Latitude"),
    lon: float = Query(..., description="Longitude"),
    radius: int = Query(100, ge=1, le=10000, description="Search radius in meters"),
) -> SearchResponse:
    """Reverse geocoding to get address from coordinates."""
    settings = get_settings()
    api_key = settings.clean_tomtom_search_api_key or settings.clean_tomtom_maps_api_key
    if not api_key:
        raise HTTPException(status_code=500, detail="TomTom Search API key not configured")

    cache = get_cache()
    cache_key = f"geocode:{lat}:{lon}:{radius}"
    cached = cache.get(cache_key)
    if cached:
        try:
            return SearchResponse.model_validate(cached)
        except Exception:
            pass

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.get(
                f"https://api.tomtom.com/search/2/reverseGeocode/{lat},{lon}.json",
                params={
                    "key": api_key,
                    "radius": radius,
                },
            )
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

        if resp.status_code == 403:
            return SearchResponse(results=[])
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail=resp.text)
        
        data = resp.json()

    # Parse reverse geocoding response
    results = []
    for item in data.get("addresses", []):
        address = item.get("address", {})
        position = item.get("position", {})
        
        result = SearchResult(
            id=f"reverse_{lat}_{lon}",
            address=address.get("freeformAddress", ""),
            position_lat=position.get("lat", lat),
            position_lon=position.get("lon", lon),
            score=1.0,
            country=address.get("country", ""),
            countryCode=address.get("countryCode", ""),
            municipality=address.get("municipality", ""),
        )
        results.append(result)

    response = SearchResponse(results=results)
    
    # Cache for 10 minutes
    cache.set(cache_key, response.model_dump(), ttl_seconds=600)
    return response


@router.post("/route", response_model=RouteResponse)
async def calculate_route(route_request: RouteRequest = Body(...)) -> RouteResponse:
    """Calculate route between waypoints using TomTom Routing API."""
    settings = get_settings()
    api_key = settings.clean_tomtom_search_api_key or settings.clean_tomtom_maps_api_key
    if not api_key:
        raise HTTPException(status_code=500, detail="TomTom Routing API key not configured")

    if len(route_request.waypoints) < 2:
        raise HTTPException(status_code=400, detail="At least 2 waypoints required")

    # Format waypoints for TomTom API (lat,lon format)
    waypoints_str = ":".join([f"{lat},{lon}" for lon, lat in route_request.waypoints])
    
    cache = get_cache()
    cache_key = f"route:{hash(waypoints_str)}:{route_request.travelMode}:{route_request.routeType}:{route_request.traffic}"
    cached = cache.get(cache_key)
    if cached:
        try:
            return RouteResponse.model_validate(cached)
        except Exception:
            pass

    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            params = {
                "key": api_key,
                "travelMode": route_request.travelMode,
                "routeType": route_request.routeType,
                "traffic": "true" if route_request.traffic else "false",
            }
            
            if route_request.avoid:
                params["avoid"] = route_request.avoid

            resp = await client.get(
                f"https://api.tomtom.com/routing/1/calculateRoute/{waypoints_str}/json",
                params=params,
            )
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

        if resp.status_code == 403:
            # API key lacks Routing entitlement, return fallback
            return _create_fallback_route(route_request.waypoints)
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail=resp.text)
        
        data = resp.json()

    # Parse TomTom routing response
    try:
        routes = data.get("routes", [])
        if not routes:
            return _create_fallback_route(route_request.waypoints)
        
        route = routes[0]
        summary = route.get("summary", {})
        legs = route.get("legs", [])
        
        # Extract route coordinates
        coordinates = []
        for leg in legs:
            points = leg.get("points", [])
            for point in points:
                coordinates.append([point.get("longitude", 0), point.get("latitude", 0)])
        
        response = RouteResponse(
            summary=RouteSummary(
                distance=summary.get("lengthInMeters", 0),
                time=summary.get("travelTimeInSeconds", 0),
                trafficDelay=summary.get("trafficDelayInSeconds"),
                departure=summary.get("departureTime"),
                arrival=summary.get("arrivalTime"),
            ),
            coordinates=coordinates,
        )
        
        # Cache for 5 minutes
        cache.set(cache_key, response.model_dump(), ttl_seconds=300)
        return response
        
    except Exception as e:
        # Fallback to straight line route
        return _create_fallback_route(route_request.waypoints)


def _create_fallback_route(waypoints: List[List[float]]) -> RouteResponse:
    """Create a fallback straight-line route when routing API fails."""
    if len(waypoints) < 2:
        return RouteResponse(
            summary=RouteSummary(distance=0, time=0),
            coordinates=waypoints,
        )
    
    # Calculate straight line distance
    total_distance = 0
    for i in range(1, len(waypoints)):
        lon1, lat1 = waypoints[i-1]
        lon2, lat2 = waypoints[i]
        
        # Haversine formula
        import math
        R = 6371000  # Earth's radius in meters
        φ1 = math.radians(lat1)
        φ2 = math.radians(lat2)
        Δφ = math.radians(lat2 - lat1)
        Δλ = math.radians(lon2 - lon1)

        a = (math.sin(Δφ / 2) * math.sin(Δφ / 2) +
             math.cos(φ1) * math.cos(φ2) *
             math.sin(Δλ / 2) * math.sin(Δλ / 2))
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        
        total_distance += R * c
    
    # Estimate travel time (assuming 50 km/h average speed)
    estimated_time = int(total_distance / 50 * 3.6)  # Convert to seconds
    
    return RouteResponse(
        summary=RouteSummary(
            distance=int(total_distance),
            time=estimated_time,
        ),
        coordinates=waypoints,
    )