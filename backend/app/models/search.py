from typing import List, Optional
from pydantic import BaseModel, Field


class SearchResult(BaseModel):
    id: str
    address: str
    position_lat: float = Field(..., alias="lat")
    position_lon: float = Field(..., alias="lon")
    score: float = 0.0
    country: Optional[str] = None
    countryCode: Optional[str] = None
    municipality: Optional[str] = None
    poi: Optional[str] = None


class SearchResponse(BaseModel):
    results: List[SearchResult] = Field(default_factory=list)
    total: int = 0
    
    def model_post_init(self, __context):
        if not self.total:
            self.total = len(self.results)


class RouteRequest(BaseModel):
    waypoints: List[List[float]] = Field(..., description="List of [lon, lat] coordinates")
    travelMode: str = Field("car", description="Travel mode: car, truck, taxi, bus, van, motorcycle, bicycle, pedestrian")
    routeType: str = Field("fastest", description="Route type: fastest, shortest, eco, thrilling")
    traffic: bool = Field(True, description="Consider live traffic")
    avoid: Optional[str] = Field(None, description="Features to avoid: tollRoads, ferries, unpavedRoads, etc.")


class RouteInstruction(BaseModel):
    instruction: str
    distance: int  # meters
    time: int  # seconds
    coordinates: List[float]  # [lon, lat]


class RouteSummary(BaseModel):
    distance: int  # meters
    time: int  # seconds
    trafficDelay: Optional[int] = None  # seconds
    departure: Optional[str] = None
    arrival: Optional[str] = None


class RouteResponse(BaseModel):
    summary: RouteSummary
    instructions: List[RouteInstruction] = Field(default_factory=list)
    coordinates: List[List[float]] = Field(default_factory=list)  # Full route geometry
    trafficIncidents: Optional[int] = None