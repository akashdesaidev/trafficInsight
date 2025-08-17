from fastapi import APIRouter, HTTPException, Query
from typing import Dict, Any
from ..services.osm_service import osm_service
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/osm", tags=["osm"])

@router.get("/road-info")
async def get_road_info(
    lat: float = Query(..., description="Latitude coordinate", ge=-90, le=90),
    lon: float = Query(..., description="Longitude coordinate", ge=-180, le=180),
    radius: int = Query(100, description="Search radius in meters", ge=10, le=1000)
) -> Dict[str, Any]:
    """
    Get OpenStreetMap road information for a specific location.
    
    This endpoint fetches road data from OSM using the Overpass API,
    including highway type, lanes, speed limits, and estimated capacity.
    
    Args:
        lat: Latitude coordinate (-90 to 90)
        lon: Longitude coordinate (-180 to 180)
        radius: Search radius in meters (10 to 1000, default: 100)
    
    Returns:
        Dictionary containing road information and capacity estimates
    
    Example:
        GET /api/osm/road-info?lat=12.9716&lon=77.5946&radius=150
    """
    try:
        logger.info(f"Fetching OSM road info for coordinates: {lat}, {lon} with radius {radius}m")
        
        road_data = await osm_service.get_road_info(lat, lon, radius)
        
        logger.info(f"Successfully fetched OSM data: {road_data.get('road_found', False)}")
        
        return {
            "success": True,
            "coordinates": {
                "lat": lat,
                "lon": lon,
                "radius": radius
            },
            "data": road_data
        }
        
    except HTTPException:
        # Re-raise HTTP exceptions from the service
        raise
    except Exception as e:
        logger.error(f"Unexpected error in OSM endpoint: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to fetch road information"
        )

@router.get("/test")
async def test_osm_integration() -> Dict[str, Any]:
    """
    Test endpoint to verify OSM integration with a known location.
    
    Uses Bangalore coordinates (MG Road area) as a test case.
    
    Returns:
        Test results showing OSM API connectivity and data parsing
    """
    try:
        # Test coordinates: MG Road, Bangalore
        test_lat = 12.9716
        test_lon = 77.5946
        
        logger.info("Running OSM integration test")
        
        road_data = await osm_service.get_road_info(test_lat, test_lon, 200)
        
        return {
            "success": True,
            "test_location": "MG Road, Bangalore",
            "coordinates": {
                "lat": test_lat,
                "lon": test_lon
            },
            "osm_integration_status": "working" if road_data.get("road_found") else "no_data",
            "test_results": road_data,
            "message": "OSM integration test completed successfully"
        }
        
    except Exception as e:
        logger.error(f"OSM integration test failed: {e}")
        return {
            "success": False,
            "test_location": "MG Road, Bangalore",
            "osm_integration_status": "failed",
            "error": str(e),
            "message": "OSM integration test failed"
        }

@router.get("/capacity-estimate")
async def get_capacity_estimate(
    lat: float = Query(..., description="Latitude coordinate", ge=-90, le=90),
    lon: float = Query(..., description="Longitude coordinate", ge=-180, le=180),
    data_points: int = Query(..., description="Number of traffic data points", ge=1)
) -> Dict[str, Any]:
    """
    Get enhanced vehicle capacity estimate using OSM road data.
    
    This endpoint demonstrates how OSM data can improve traffic impact calculations
    by providing road capacity context for better vehicle count estimation.
    
    Args:
        lat: Latitude coordinate
        lon: Longitude coordinate
        data_points: Number of traffic data points (from chokepoint count)
    
    Returns:
        Enhanced capacity estimate with OSM context
    """
    try:
        logger.info(f"Calculating capacity estimate for {data_points} data points at {lat}, {lon}")
        
        # Get OSM road data
        road_data = await osm_service.get_road_info(lat, lon, 150)
        
        if not road_data.get("road_found"):
            # Fallback to simple estimation
            simple_estimate = data_points * 15
            return {
                "success": True,
                "estimation_method": "simple_fallback",
                "estimated_vehicles": simple_estimate,
                "confidence": "low",
                "message": "No OSM road data found, using simple estimation",
                "osm_data_available": False
            }
        
        # Enhanced estimation using OSM data
        road_info = road_data["road_data"]
        road_capacity = road_info["estimated_capacity"]
        highway_type = road_info["highway_type"]
        lanes = road_info["lanes"]
        
        # Calculate enhanced estimate
        # Base multiplier adjusted by road capacity
        base_multiplier = 15
        
        # Capacity factor (higher capacity roads = more vehicles per data point)
        capacity_factor = min(road_capacity / 1000, 3.0)  # Cap at 3x
        
        # Highway type factor
        highway_factors = {
            "motorway": 2.5,
            "trunk": 2.0,
            "primary": 1.8,
            "secondary": 1.5,
            "tertiary": 1.2,
            "residential": 1.0,
            "service": 0.8
        }
        highway_factor = highway_factors.get(highway_type, 1.0)
        
        # Lane factor
        lane_factor = min(lanes / 2, 2.0)  # Cap at 2x for very wide roads
        
        # Combined multiplier
        enhanced_multiplier = base_multiplier * capacity_factor * highway_factor * lane_factor
        enhanced_estimate = int(data_points * enhanced_multiplier)
        
        # Confidence based on data quality
        confidence = "high" if road_info["name"] != "Unnamed Road" else "medium"
        
        return {
            "success": True,
            "estimation_method": "osm_enhanced",
            "estimated_vehicles": enhanced_estimate,
            "simple_estimate": data_points * 15,
            "improvement_factor": round(enhanced_estimate / (data_points * 15), 2),
            "confidence": confidence,
            "osm_data_available": True,
            "road_context": {
                "name": road_info["name"],
                "highway_type": highway_type,
                "lanes": lanes,
                "estimated_capacity_per_hour": road_capacity,
                "maxspeed": road_info["maxspeed"]
            },
            "calculation_factors": {
                "base_multiplier": base_multiplier,
                "capacity_factor": round(capacity_factor, 2),
                "highway_factor": highway_factor,
                "lane_factor": round(lane_factor, 2),
                "final_multiplier": round(enhanced_multiplier, 2)
            }
        }
        
    except Exception as e:
        logger.error(f"Error calculating capacity estimate: {e}")
        # Fallback to simple estimation on error
        simple_estimate = data_points * 15
        return {
            "success": False,
            "estimation_method": "simple_fallback",
            "estimated_vehicles": simple_estimate,
            "confidence": "low",
            "error": str(e),
            "message": "Error occurred, using simple estimation",
            "osm_data_available": False
        }