from typing import List, Optional
from pydantic import BaseModel, Field


class IncidentGeometry(BaseModel):
    type: str = "Point"
    coordinates: List[float] = Field(default_factory=list)


class Incident(BaseModel):
    id: str
    type: Optional[str] = None
    severity: Optional[str] = None
    description: Optional[str] = None
    startTime: Optional[str] = None
    endTime: Optional[str] = None
    geometry: Optional[IncidentGeometry] = None


class IncidentsResponse(BaseModel):
    incidents: List[Incident] = Field(default_factory=list)


class LiveTrafficResponse(BaseModel):
    tileUrlTemplate: str
    style: str = "relative-dark"
    ttlSeconds: int = 120


class TrafficFlowPoint(BaseModel):
    coordinates: List[float] = Field(default_factory=list)
    currentSpeed: Optional[float] = None
    freeFlowSpeed: Optional[float] = None
    currentTravelTime: Optional[int] = None
    freeFlowTravelTime: Optional[int] = None
    confidence: Optional[float] = None
    roadClosure: bool = False


class TrafficFlowResponse(BaseModel):
    flowSegmentData: List[TrafficFlowPoint] = Field(default_factory=list)
    version: str = "1.0"


class TrafficHistoricalData(BaseModel):
    id: int
    location: dict
    road_name: str
    segment_id: str
    timestamp: str
    date: str
    hour: int
    day_of_week: int
    speed_kmh: Optional[float] = None
    free_flow_speed_kmh: Optional[float] = None
    congestion_level: int
    delay_minutes: Optional[float] = None
    relative_speed: Optional[float] = None
    confidence_level: Optional[float] = None


class TrafficHistoryResponse(BaseModel):
    data: List[TrafficHistoricalData] = Field(default_factory=list)
    total_count: int
    returned_count: int
    date_range: dict
    granularity: str
    bbox: List[float]
    filters: dict


class OverallStats(BaseModel):
    avg_speed_kmh: float
    avg_delay_minutes: float
    avg_relative_speed: float
    total_observations: int


class HourlyPattern(BaseModel):
    hour: int
    avg_speed_kmh: float
    avg_delay_minutes: float
    observations: int


class DailyPattern(BaseModel):
    day_of_week: int
    avg_speed_kmh: float
    avg_delay_minutes: float
    observations: int


class CongestionDistribution(BaseModel):
    level: int
    count: int
    percentage: float


class TopCongestedRoad(BaseModel):
    road_name: str
    avg_delay_minutes: float
    max_delay_minutes: float
    observations: int


class TrafficStatsResponse(BaseModel):
    overall: OverallStats
    hourly_patterns: List[HourlyPattern] = Field(default_factory=list)
    daily_patterns: List[DailyPattern] = Field(default_factory=list)
    congestion_distribution: List[CongestionDistribution] = Field(default_factory=list)
    top_congested_roads: List[TopCongestedRoad] = Field(default_factory=list)
    date_range: dict
    bbox: List[float]




