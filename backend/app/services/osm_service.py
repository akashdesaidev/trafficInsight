import httpx
import asyncio
from typing import Dict, List, Optional, Any
from fastapi import HTTPException
import logging

logger = logging.getLogger(__name__)

class OSMService:
    """Service for fetching road data from OpenStreetMap using Overpass API"""
    
    def __init__(self):
        self.overpass_url = "https://overpass-api.de/api/interpreter"
        self.timeout = 30
    
    async def get_road_info(self, lat: float, lon: float, radius: int = 100) -> Dict[str, Any]:
        """
        Get road information for a specific location using OSM Overpass API
        
        Args:
            lat: Latitude
            lon: Longitude
            radius: Search radius in meters (default: 100m)
            
        Returns:
            Dictionary containing road information
        """
        try:
            # Overpass QL query to get road data around the coordinates
            query = f"""
            [out:json][timeout:25];
            (
              way["highway"]["highway"!="footway"]["highway"!="cycleway"]["highway"!="path"]
                 ["highway"!="steps"]["highway"!="pedestrian"]
                 (around:{radius},{lat},{lon});
            );
            out geom tags;
            """
            
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    self.overpass_url,
                    data={"data": query},
                    headers={"Content-Type": "application/x-www-form-urlencoded"}
                )
                response.raise_for_status()
                
                data = response.json()
                
                if not data.get("elements"):
                    return {
                        "road_found": False,
                        "message": "No road data found for this location"
                    }
                
                # Process the road data
                roads = []
                for element in data["elements"]:
                    if element.get("type") == "way":
                        tags = element.get("tags", {})
                        road_info = self._extract_road_info(tags)
                        if road_info:
                            roads.append(road_info)
                
                if not roads:
                    return {
                        "road_found": False,
                        "message": "No suitable roads found in the area"
                    }
                
                # Return the best road (highest capacity or primary road)
                best_road = self._select_best_road(roads)
                
                return {
                    "road_found": True,
                    "road_data": best_road,
                    "all_roads": roads,
                    "total_roads_found": len(roads)
                }
                
        except httpx.TimeoutException:
            logger.error(f"Timeout fetching OSM data for {lat}, {lon}")
            raise HTTPException(status_code=408, detail="OSM API timeout")
        except httpx.HTTPStatusError as e:
            logger.error(f"HTTP error fetching OSM data: {e}")
            raise HTTPException(status_code=502, detail="OSM API error")
        except Exception as e:
            logger.error(f"Error fetching OSM data: {e}")
            raise HTTPException(status_code=500, detail="Internal server error")
    
    def _extract_road_info(self, tags: Dict[str, str]) -> Optional[Dict[str, Any]]:
        """Extract relevant road information from OSM tags"""
        highway_type = tags.get("highway")
        if not highway_type:
            return None
        
        # Extract road properties
        road_info = {
            "highway_type": highway_type,
            "name": tags.get("name", "Unnamed Road"),
            "lanes": self._parse_lanes(tags.get("lanes")),
            "maxspeed": self._parse_maxspeed(tags.get("maxspeed")),
            "oneway": tags.get("oneway", "no") == "yes",
            "surface": tags.get("surface", "unknown"),
            "estimated_capacity": 0
        }
        
        # Calculate estimated capacity
        road_info["estimated_capacity"] = self._calculate_capacity(road_info)
        
        return road_info
    
    def _parse_lanes(self, lanes_str: Optional[str]) -> int:
        """Parse lanes from OSM tag"""
        if not lanes_str:
            return self._default_lanes_by_highway_type("unknown")
        
        try:
            return int(lanes_str)
        except (ValueError, TypeError):
            # Handle cases like "2;3" or "2-3"
            if ";" in lanes_str:
                return int(lanes_str.split(";")[0])
            elif "-" in lanes_str:
                return int(lanes_str.split("-")[0])
            return 2  # Default fallback
    
    def _parse_maxspeed(self, maxspeed_str: Optional[str]) -> int:
        """Parse max speed from OSM tag"""
        if not maxspeed_str:
            return 50  # Default speed limit
        
        try:
            # Handle "50 km/h" or just "50"
            speed_str = maxspeed_str.replace(" km/h", "").replace("kmh", "")
            return int(speed_str)
        except (ValueError, TypeError):
            return 50  # Default fallback
    
    def _default_lanes_by_highway_type(self, highway_type: str) -> int:
        """Get default lane count based on highway type"""
        lane_defaults = {
            "motorway": 3,
            "trunk": 2,
            "primary": 2,
            "secondary": 2,
            "tertiary": 1,
            "residential": 1,
            "service": 1,
            "unclassified": 1
        }
        return lane_defaults.get(highway_type, 1)
    
    def _calculate_capacity(self, road_info: Dict[str, Any]) -> int:
        """Calculate estimated vehicle capacity per hour"""
        lanes = road_info["lanes"]
        maxspeed = road_info["maxspeed"]
        highway_type = road_info["highway_type"]
        
        # Base capacity per lane per hour (vehicles)
        base_capacity_per_lane = {
            "motorway": 2000,
            "trunk": 1800,
            "primary": 1500,
            "secondary": 1200,
            "tertiary": 1000,
            "residential": 800,
            "service": 600,
            "unclassified": 800
        }
        
        base_capacity = base_capacity_per_lane.get(highway_type, 800)
        
        # Adjust for speed (higher speed = higher capacity)
        speed_factor = min(maxspeed / 50, 1.5)  # Cap at 1.5x
        
        # Calculate total capacity
        total_capacity = int(base_capacity * lanes * speed_factor)
        
        return total_capacity
    
    def _select_best_road(self, roads: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Select the best road from available options"""
        # Priority order for highway types
        highway_priority = {
            "motorway": 7,
            "trunk": 6,
            "primary": 5,
            "secondary": 4,
            "tertiary": 3,
            "residential": 2,
            "service": 1,
            "unclassified": 1
        }
        
        # Sort by priority and capacity
        def road_score(road):
            highway_score = highway_priority.get(road["highway_type"], 0)
            capacity_score = road["estimated_capacity"] / 1000  # Normalize
            return highway_score + capacity_score
        
        return max(roads, key=road_score)

# Global instance
osm_service = OSMService()