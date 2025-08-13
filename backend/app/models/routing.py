from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime


class RouteStep(BaseModel):
    """Individual step in a route leg."""
    distance: str = Field(..., description="Distance text (e.g., '1.2 km')")
    distance_value: int = Field(..., description="Distance in meters")
    duration: str = Field(..., description="Duration text (e.g., '5 mins')")
    duration_value: int = Field(..., description="Duration in seconds")
    html_instructions: str = Field(..., description="HTML formatted instructions")
    travel_mode: str = Field(..., description="Travel mode (WALKING, TRANSIT, etc.)")
    start_location: Dict[str, float] = Field(..., description="Start coordinates")
    end_location: Dict[str, float] = Field(..., description="End coordinates")
    
    # Transit-specific fields
    transit_details: Optional[Dict[str, Any]] = Field(None, description="Transit information")


class RouteLeg(BaseModel):
    """A leg of the route (between waypoints)."""
    distance: str = Field(..., description="Total distance text")
    distance_value: int = Field(..., description="Total distance in meters") 
    duration: str = Field(..., description="Total duration text")
    duration_value: int = Field(..., description="Total duration in seconds")
    start_address: str = Field(..., description="Starting address")
    end_address: str = Field(..., description="Ending address")
    start_location: Dict[str, float] = Field(..., description="Start coordinates")
    end_location: Dict[str, float] = Field(..., description="End coordinates")
    steps: List[RouteStep] = Field(..., description="Individual route steps")
    
    # Transit-specific fields
    departure_time: Optional[str] = None
    arrival_time: Optional[str] = None


class TransitAgency(BaseModel):
    """Transit agency information."""
    name: str
    phone: Optional[str] = None
    url: Optional[str] = None


class TransitLine(BaseModel):
    """Transit line information."""
    name: str
    short_name: Optional[str] = None
    color: Optional[str] = None
    agencies: List[TransitAgency] = Field(default_factory=list)
    vehicle: Optional[Dict[str, str]] = None


class TransitStop(BaseModel):
    """Transit stop information."""
    name: str
    location: Dict[str, float]


class RouteAlternative(BaseModel):
    """A single route alternative."""
    summary: str = Field(..., description="Route summary")
    legs: List[RouteLeg] = Field(..., description="Route legs")
    overview_polyline: str = Field(..., description="Encoded polyline for route")
    bounds: Dict[str, Dict[str, float]] = Field(..., description="Route bounds")
    copyrights: str = Field(..., description="Copyright information")
    warnings: List[str] = Field(default_factory=list)
    waypoint_order: List[int] = Field(default_factory=list)
    
    # Total route metrics
    total_distance: str = Field(..., description="Total route distance")
    total_distance_value: int = Field(..., description="Total distance in meters")
    total_duration: str = Field(..., description="Total route duration") 
    total_duration_value: int = Field(..., description="Total duration in seconds")


class DirectionsRequest(BaseModel):
    """Request for directions between locations."""
    origin: str = Field(..., description="Starting location (address or lat,lng)")
    destination: str = Field(..., description="Destination location (address or lat,lng)")
    mode: str = Field("transit", description="Travel mode: driving, walking, bicycling, transit")
    departure_time: Optional[str] = Field(None, description="Departure time (ISO format or 'now')")
    arrival_time: Optional[str] = Field(None, description="Preferred arrival time (ISO format)")
    transit_mode: Optional[List[str]] = Field(None, description="Transit modes: bus, subway, train, tram, rail")
    transit_routing_preference: Optional[str] = Field("best_guess", description="less_walking, fewer_transfers")
    language: str = Field("en", description="Language for directions")
    region: str = Field("in", description="Region code")
    alternatives: bool = Field(True, description="Return alternative routes")
    avoid: Optional[List[str]] = Field(None, description="Features to avoid: tolls, highways, ferries")


class DirectionsResponse(BaseModel):
    """Response containing route directions."""
    status: str = Field(..., description="Response status")
    routes: List[RouteAlternative] = Field(..., description="Available routes")
    geocoded_waypoints: Optional[List[Dict[str, Any]]] = Field(None, description="Geocoded waypoint info")
    error_message: Optional[str] = Field(None, description="Error message if any")
    
    # Convenience methods
    def get_best_route(self) -> Optional[RouteAlternative]:
        """Get the best (first) route alternative."""
        return self.routes[0] if self.routes else None
    
    def has_transit_options(self) -> bool:
        """Check if any route contains transit steps."""
        for route in self.routes:
            for leg in route.legs:
                for step in leg.steps:
                    if step.travel_mode == "TRANSIT":
                        return True
        return False


class TransitCost(BaseModel):
    """Transit cost information."""
    total_cost: Optional[float] = Field(None, description="Total estimated cost in INR")
    cost_breakdown: List[Dict[str, Any]] = Field(default_factory=list, description="Cost per transit segment")
    currency: str = Field("INR", description="Currency code")
    estimation_note: Optional[str] = Field(None, description="Note about cost estimation")


class TransitDirectionsResponse(BaseModel):
    """Simplified response focused on transit directions."""
    success: bool = Field(..., description="Whether directions were found")
    total_duration: Optional[str] = None
    total_distance: Optional[str] = None
    departure_time: Optional[str] = None
    arrival_time: Optional[str] = None
    
    # Cost estimation
    cost: Optional[TransitCost] = Field(None, description="Travel cost estimation")
    
    # Simplified step-by-step instructions
    instructions: List[str] = Field(default_factory=list, description="Human-readable directions")
    transit_summary: Optional[str] = Field(None, description="Transit route summary")
    
    # Error handling
    error: Optional[str] = Field(None, description="Error message")
    suggestions: List[str] = Field(default_factory=list, description="Alternative suggestions")