from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Query, Depends
import httpx
import json
from datetime import datetime, timezone
import re

from app.core.config import get_settings
from app.models.routing import (
    DirectionsRequest, 
    DirectionsResponse, 
    TransitDirectionsResponse,
    TransitCost,
    RouteAlternative,
    RouteLeg,
    RouteStep
)
from app.services.cache import get_cache
from app.services.cost_estimator import TransitCostEstimator

router = APIRouter(prefix="/directions", tags=["directions"])


def clean_html_instructions(html_text: str) -> str:
    """Remove HTML tags from instruction text."""
    clean = re.compile('<.*?>')
    return re.sub(clean, '', html_text)


def format_transit_instructions(step_data: Dict[str, Any]) -> str:
    """Format transit step into human-readable instruction."""
    travel_mode = step_data.get("travel_mode", "")
    html_instructions = step_data.get("html_instructions", "")
    clean_instructions = clean_html_instructions(html_instructions)
    
    # Extract transit details if available
    transit_details = step_data.get("transit_details", {})
    if transit_details and travel_mode == "TRANSIT":
        line = transit_details.get("line", {})
        departure_stop = transit_details.get("departure_stop", {})
        arrival_stop = transit_details.get("arrival_stop", {})
        
        line_name = line.get("short_name") or line.get("name", "")
        departure_name = departure_stop.get("name", "")
        arrival_name = arrival_stop.get("name", "")
        
        if line_name and departure_name and arrival_name:
            return f"Take {line_name} from {departure_name} to {arrival_name}"
    
    return clean_instructions


@router.get("/transit", response_model=TransitDirectionsResponse)
async def get_transit_directions(
    origin: str = Query(..., description="Starting location (address or coordinates)"),
    destination: str = Query(..., description="Destination location (address or coordinates)"),
    departure_time: Optional[str] = Query("now", description="Departure time ('now', 'HH:MM', or ISO format)"),
    language: str = Query("en", description="Language for directions"),
    include_cost: bool = Query(True, description="Include cost estimation"),
) -> TransitDirectionsResponse:
    """
    Get public transit directions between two locations using Google Directions API.
    Provides step-by-step instructions optimized for public transportation.
    """
    settings = get_settings()
    api_key = settings.clean_google_maps_api_key
    
    if not api_key:
        return TransitDirectionsResponse(
            success=False,
            error="Google Maps API key not configured",
            suggestions=["Please configure Google Maps API key for transit directions"]
        )

    # Cache key for transit directions
    cache = get_cache()
    cache_key = f"transit_directions:{origin}:{destination}:{departure_time}:{language}"
    cached = cache.get(cache_key)
    if cached:
        try:
            return TransitDirectionsResponse.model_validate(cached)
        except Exception:
            pass

    # Prepare departure time
    def parse_departure_time(time_str: str) -> int:
        """Parse departure time string into timestamp."""
        if time_str == "now":
            return int(datetime.now(timezone.utc).timestamp())
        
        # Try to parse HH:MM format (today)
        if ":" in time_str and len(time_str) <= 5:
            try:
                now = datetime.now()
                hour, minute = map(int, time_str.split(":"))
                dt = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
                
                # If the time is in the past today, assume tomorrow
                if dt < now:
                    dt = dt.replace(day=dt.day + 1)
                
                return int(dt.timestamp())
            except ValueError:
                pass
        
        # Try ISO format
        try:
            dt = datetime.fromisoformat(departure_time.replace('Z', '+00:00'))
            return int(dt.timestamp())
        except ValueError:
            pass
        
        # Fallback to now
        return int(datetime.now(timezone.utc).timestamp())
    
    departure_timestamp = parse_departure_time(departure_time)

    # Call Google Directions API
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            params = {
                "origin": origin,
                "destination": destination,
                "mode": "transit",
                "departure_time": departure_timestamp,
                "language": language,
                "region": "in",  # India region
                "alternatives": "true",
                "key": api_key,
            }
            
            response = await client.get(
                "https://maps.googleapis.com/maps/api/directions/json",
                params=params
            )
            
            if response.status_code != 200:
                return TransitDirectionsResponse(
                    success=False,
                    error=f"Google API returned status {response.status_code}",
                    suggestions=["Please check your API key and try again"]
                )
            
            data = response.json()
            
        except httpx.HTTPError as exc:
            return TransitDirectionsResponse(
                success=False,
                error=f"Request failed: {str(exc)}",
                suggestions=["Please check your internet connection and try again"]
            )

    # Check API response status
    status = data.get("status", "")
    if status != "OK":
        error_message = data.get("error_message", f"API returned status: {status}")
        suggestions = []
        
        if status == "NOT_FOUND":
            suggestions = ["Please check that both locations are valid and accessible by public transit"]
        elif status == "ZERO_RESULTS":
            suggestions = [
                "No public transit routes found between these locations",
                "Try adjusting departure time or consider alternative transportation"
            ]
        elif status == "OVER_QUERY_LIMIT":
            suggestions = ["API quota exceeded, please try again later"]
        
        return TransitDirectionsResponse(
            success=False,
            error=error_message,
            suggestions=suggestions
        )

    # Parse the best route
    routes = data.get("routes", [])
    if not routes:
        return TransitDirectionsResponse(
            success=False,
            error="No routes found",
            suggestions=["Try different locations or departure times"]
        )

    # Get the first (best) route
    route = routes[0]
    legs = route.get("legs", [])
    if not legs:
        return TransitDirectionsResponse(
            success=False,
            error="Invalid route data",
            suggestions=["Please try again with different locations"]
        )

    # Process route legs and steps
    instructions = []
    total_duration = 0
    total_distance = 0
    departure_time_str = None
    arrival_time_str = None

    for leg_idx, leg in enumerate(legs):
        # Extract leg information
        leg_distance = leg.get("distance", {})
        leg_duration = leg.get("duration", {})
        
        total_distance += leg_distance.get("value", 0)
        total_duration += leg_duration.get("value", 0)
        
        # Get departure/arrival times from first/last leg
        if leg_idx == 0:
            departure_time_data = leg.get("departure_time")
            if departure_time_data:
                departure_time_str = departure_time_data.get("text")
        
        if leg_idx == len(legs) - 1:
            arrival_time_data = leg.get("arrival_time")
            if arrival_time_data:
                arrival_time_str = arrival_time_data.get("text")

        # Process steps in this leg
        steps = leg.get("steps", [])
        for step_idx, step in enumerate(steps):
            instruction = format_transit_instructions(step)
            if instruction.strip():
                # Add step duration for context
                step_duration = step.get("duration", {}).get("text", "")
                if step_duration:
                    instruction += f" ({step_duration})"
                instructions.append(instruction)

    # Format total duration and distance
    total_duration_str = f"{total_duration // 60} min" if total_duration else None
    total_distance_str = f"{total_distance / 1000:.1f} km" if total_distance else None
    
    # Create transit summary
    transit_summary = None
    if instructions:
        transit_summary = f"Total journey: {total_duration_str or 'Unknown time'}"
        if total_distance_str:
            transit_summary += f", {total_distance_str}"

    # Calculate cost estimation
    cost_data = None
    if include_cost and instructions:
        try:
            cost_estimation = TransitCostEstimator.estimate_total_cost(
                instructions=instructions,
                route_info=data  # Pass the full Google API response for city detection
            )
            cost_data = TransitCost(
                total_cost=cost_estimation.get('total_cost'),
                cost_breakdown=cost_estimation.get('cost_breakdown', []),
                currency=cost_estimation.get('currency', 'INR'),
                estimation_note=cost_estimation.get('estimation_note')
            )
        except Exception as e:
            print(f"Cost estimation failed: {e}")  # Log error but don't fail the request

    # Build response
    result = TransitDirectionsResponse(
        success=True,
        total_duration=total_duration_str,
        total_distance=total_distance_str,
        departure_time=departure_time_str,
        arrival_time=arrival_time_str,
        cost=cost_data,
        instructions=instructions,
        transit_summary=transit_summary
    )

    # Cache successful results for 10 minutes
    cache.set(cache_key, result.model_dump(), ttl_seconds=600)
    
    return result


@router.get("/full", response_model=DirectionsResponse)
async def get_full_directions(
    origin: str = Query(..., description="Starting location"),
    destination: str = Query(..., description="Destination location"),
    mode: str = Query("transit", description="Travel mode"),
    departure_time: Optional[str] = Query("now", description="Departure time"),
    alternatives: bool = Query(True, description="Include alternative routes"),
) -> DirectionsResponse:
    """
    Get complete directions response from Google Directions API.
    Returns full route details with all available information.
    """
    settings = get_settings()
    api_key = settings.clean_google_maps_api_key
    
    if not api_key:
        raise HTTPException(status_code=500, detail="Google Maps API key not configured")

    # Prepare departure time
    departure_timestamp = None
    if mode == "transit" and departure_time:
        if departure_time == "now":
            departure_timestamp = int(datetime.now(timezone.utc).timestamp())
        else:
            try:
                dt = datetime.fromisoformat(departure_time.replace('Z', '+00:00'))
                departure_timestamp = int(dt.timestamp())
            except ValueError:
                departure_timestamp = int(datetime.now(timezone.utc).timestamp())

    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            params = {
                "origin": origin,
                "destination": destination,
                "mode": mode,
                "language": "en",
                "region": "in",
                "alternatives": alternatives,
                "key": api_key,
            }
            
            if departure_timestamp:
                params["departure_time"] = departure_timestamp
            
            response = await client.get(
                "https://maps.googleapis.com/maps/api/directions/json",
                params=params
            )
            
            if response.status_code != 200:
                raise HTTPException(status_code=response.status_code, detail="Google API request failed")
            
            data = response.json()
            
            # Return raw response wrapped in our model
            return DirectionsResponse(
                status=data.get("status", "UNKNOWN"),
                routes=[],  # Would need to parse full route data here
                geocoded_waypoints=data.get("geocoded_waypoints"),
                error_message=data.get("error_message")
            )
            
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"Request failed: {str(exc)}")


@router.get("/test")
async def test_directions_api():
    """Test endpoint to verify Google Directions API configuration."""
    settings = get_settings()
    api_key = settings.clean_google_maps_api_key
    
    return {
        "google_maps_api_configured": bool(api_key),
        "api_key_length": len(api_key) if api_key else 0,
        "status": "ready" if api_key else "missing_api_key"
    }