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
    style: str = "relative/dark"
    ttlSeconds: int = 120


