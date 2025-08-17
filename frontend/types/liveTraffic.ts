// Live Traffic Data Types for Enhanced Chokepoint Modal

// Flow Segment Data from TomTom API
export interface TrafficFlowPoint {
  coordinate: {
    latitude: number;
    longitude: number;
  };
  currentSpeed: number;
  freeFlowSpeed: number;
  currentTravelTime: number;
  freeFlowTravelTime: number;
  confidence: number;
  roadClosure: boolean;
}

export interface FlowSegmentResponse {
  flowSegmentData: {
    frc: string;
    currentSpeed: number;
    freeFlowSpeed: number;
    currentTravelTime: number;
    freeFlowTravelTime: number;
    confidence: number;
    roadClosure: boolean;
    coordinates: {
      coordinate: Array<{
        latitude: number;
        longitude: number;
      }>;
    };
  };
}

// Traffic Incidents Data
export interface IncidentGeometry {
  type: string;
  coordinates: [number, number]; // [lon, lat]
}

export interface TrafficIncident {
  id: string;
  type: string;
  severity: 'unknown' | 'minor' | 'moderate' | 'major';
  description: string | null;
  startTime: string | null;
  endTime: string | null;
  geometry: IncidentGeometry | null;
  magnitudeOfDelay?: number;
  delayMagnitude?: number;
}

export interface IncidentsResponse {
  incidents: TrafficIncident[];
}

// OSM Road Infrastructure Data
export interface OSMRoadInfo {
  highway_type: string;
  name: string;
  lanes: number;
  maxspeed: number;
  oneway: boolean;
  surface: string | null;
  estimated_capacity: number;
}

export interface OSMResponse {
  road_found: boolean;
  road_data?: OSMRoadInfo;
  all_roads?: OSMRoadInfo[];
  total_roads_found?: number;
  message?: string;
}

// Live Data State Management
export interface LiveTrafficData {
  flowSegment: FlowSegmentResponse | null;
  incidents: TrafficIncident[];
  roadInfo: OSMRoadInfo | null;
}

export interface LiveDataLoadingState {
  flowSegment: boolean;
  incidents: boolean;
  roadInfo: boolean;
}

export interface LiveDataErrorState {
  flowSegment: string | null;
  incidents: string | null;
  roadInfo: string | null;
}

// Enhanced Chokepoint with Live Data
export interface EnhancedChokepoint {
  // Original chokepoint data
  id: number;
  location: { lat: number; lon: number };
  road_name: string;
  segment_id: string;
  congestion_score: number;
  rank: number;
  avg_delay_minutes: number;
  max_delay_minutes: number;
  frequency_score: number;
  intensity_score: number;
  duration_score: number;
  peak_periods: Array<{
    start: string;
    end: string;
    severity: number;
    avg_delay_minutes?: number;
  }>;
  worst_hour: number;
  worst_day: number;
  last_updated: string | null;
  total_observations: number;
  data_quality_score: number;
  
  // Live data
  liveData?: LiveTrafficData;
}

// Utility types for calculations
export interface TrafficMetrics {
  speedReduction: number; // percentage
  delayFactor: number; // ratio of current to free flow time
  congestionLevel: 'free' | 'light' | 'moderate' | 'heavy' | 'severe';
  efficiency: number; // percentage
}

export interface IncidentImpact {
  nearbyIncidents: number;
  hasRoadClosure: boolean;
  severityLevel: 'low' | 'medium' | 'high';
  estimatedDelay: number; // minutes
}

export interface RoadCapacityAnalysis {
  theoreticalCapacity: number; // vehicles per hour
  currentUtilization: number; // percentage
  bottleneckRisk: 'low' | 'medium' | 'high';
  infrastructureScore: number; // 0-100
}