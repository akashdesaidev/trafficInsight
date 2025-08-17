import { useState, useEffect, useCallback } from 'react';
import {
  LiveTrafficData,
  LiveDataLoadingState,
  LiveDataErrorState,
  FlowSegmentResponse,
  IncidentsResponse,
  OSMResponse,
  TrafficMetrics,
  IncidentImpact,
  RoadCapacityAnalysis
} from '@/types/liveTraffic';

interface UseLiveTrafficDataProps {
  lat: number;
  lon: number;
  enabled: boolean;
}

interface UseLiveTrafficDataReturn {
  data: LiveTrafficData;
  loading: LiveDataLoadingState;
  error: LiveDataErrorState;
  metrics: TrafficMetrics | null;
  incidentImpact: IncidentImpact | null;
  roadCapacity: RoadCapacityAnalysis | null;
  refetch: () => void;
}

export function useLiveTrafficData({
  lat,
  lon,
  enabled
}: UseLiveTrafficDataProps): UseLiveTrafficDataReturn {
  const [data, setData] = useState<LiveTrafficData>({
    flowSegment: null,
    incidents: [],
    roadInfo: null
  });

  const [loading, setLoading] = useState<LiveDataLoadingState>({
    flowSegment: false,
    incidents: false,
    roadInfo: false
  });

  const [error, setError] = useState<LiveDataErrorState>({
    flowSegment: null,
    incidents: null,
    roadInfo: null
  });

  const [metrics, setMetrics] = useState<TrafficMetrics | null>(null);
  const [incidentImpact, setIncidentImpact] = useState<IncidentImpact | null>(null);
  const [roadCapacity, setRoadCapacity] = useState<RoadCapacityAnalysis | null>(null);

  // Fetch flow segment data
  const fetchFlowSegment = useCallback(async () => {
    if (!enabled) return;

    setLoading(prev => ({ ...prev, flowSegment: true }));
    setError(prev => ({ ...prev, flowSegment: null }));

    try {
      const response = await fetch(
        `/api/traffic/flow-segment?lat=${lat}&lon=${lon}&style=absolute&resolution=10`
      );
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const flowData: FlowSegmentResponse = await response.json();
      setData(prev => ({ ...prev, flowSegment: flowData }));
      
      // Calculate traffic metrics
      if (flowData.flowSegmentData) {
        const { currentSpeed, freeFlowSpeed, currentTravelTime, freeFlowTravelTime } = flowData.flowSegmentData;
        const speedReduction = ((freeFlowSpeed - currentSpeed) / freeFlowSpeed) * 100;
        const delayFactor = currentTravelTime / freeFlowTravelTime;
        const efficiency = (currentSpeed / freeFlowSpeed) * 100;
        
        let congestionLevel: TrafficMetrics['congestionLevel'] = 'free';
        if (speedReduction > 75) congestionLevel = 'severe';
        else if (speedReduction > 50) congestionLevel = 'heavy';
        else if (speedReduction > 25) congestionLevel = 'moderate';
        else if (speedReduction > 10) congestionLevel = 'light';
        
        setMetrics({
          speedReduction: Math.max(0, speedReduction),
          delayFactor,
          congestionLevel,
          efficiency: Math.min(100, efficiency)
        });
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch flow segment data';
      setError(prev => ({ ...prev, flowSegment: errorMessage }));
      console.error('Flow segment fetch error:', err);
    } finally {
      setLoading(prev => ({ ...prev, flowSegment: false }));
    }
  }, [lat, lon, enabled]);

  // Fetch incidents data
  const fetchIncidents = useCallback(async () => {
    if (!enabled) return;

    setLoading(prev => ({ ...prev, incidents: true }));
    setError(prev => ({ ...prev, incidents: null }));

    try {
      // Create a small bounding box around the point (±0.01 degrees ≈ 1km)
      const bbox = `${lon - 0.01},${lat - 0.01},${lon + 0.01},${lat + 0.01}`;
      const response = await fetch(
        `/api/traffic/traffic-incidents?bbox=${bbox}&language=en-GB&timeValidityFilter=present`
      );
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const incidentsData: IncidentsResponse = await response.json();
      setData(prev => ({ ...prev, incidents: incidentsData.incidents }));
      
      // Calculate incident impact
      const nearbyIncidents = incidentsData.incidents.length;
      const hasRoadClosure = incidentsData.incidents.some(incident => 
        incident.description?.toLowerCase().includes('closure') ||
        incident.description?.toLowerCase().includes('closed')
      );
      
      const majorIncidents = incidentsData.incidents.filter(incident => 
        incident.severity === 'major'
      ).length;
      
      let severityLevel: IncidentImpact['severityLevel'] = 'low';
      if (hasRoadClosure || majorIncidents > 2) severityLevel = 'high';
      else if (majorIncidents > 0 || nearbyIncidents > 3) severityLevel = 'medium';
      
      const estimatedDelay = hasRoadClosure ? 15 : majorIncidents * 5 + nearbyIncidents * 2;
      
      setIncidentImpact({
        nearbyIncidents,
        hasRoadClosure,
        severityLevel,
        estimatedDelay
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch incidents data';
      setError(prev => ({ ...prev, incidents: errorMessage }));
      console.error('Incidents fetch error:', err);
    } finally {
      setLoading(prev => ({ ...prev, incidents: false }));
    }
  }, [lat, lon, enabled]);

  // Fetch OSM road info
  const fetchRoadInfo = useCallback(async () => {
    if (!enabled) return;

    setLoading(prev => ({ ...prev, roadInfo: true }));
    setError(prev => ({ ...prev, roadInfo: null }));

    try {
      const response = await fetch(
        `/api/osm/road-info?lat=${lat}&lon=${lon}&radius=100`
      );
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const osmData: OSMResponse = await response.json();
      
      if (osmData.road_found && osmData.road_data) {
        setData(prev => ({ ...prev, roadInfo: osmData.road_data! }));
        
        // Calculate road capacity analysis
        const roadInfo = osmData.road_data;
        const theoreticalCapacity = roadInfo.estimated_capacity;
        
        // Estimate current utilization based on speed reduction
        const currentUtilization = metrics ? Math.min(100, metrics.speedReduction * 1.5) : 50;
        
        let bottleneckRisk: RoadCapacityAnalysis['bottleneckRisk'] = 'low';
        if (currentUtilization > 80) bottleneckRisk = 'high';
        else if (currentUtilization > 60) bottleneckRisk = 'medium';
        
        // Infrastructure score based on highway type, lanes, and capacity
        const highwayScore = {
          'motorway': 100, 'trunk': 90, 'primary': 80, 'secondary': 70,
          'tertiary': 60, 'residential': 40, 'unclassified': 30
        }[roadInfo.highway_type] || 50;
        
        const laneScore = Math.min(100, roadInfo.lanes * 25);
        const infrastructureScore = (highwayScore + laneScore) / 2;
        
        setRoadCapacity({
          theoreticalCapacity,
          currentUtilization,
          bottleneckRisk,
          infrastructureScore
        });
      } else {
        setData(prev => ({ ...prev, roadInfo: null }));
        setRoadCapacity(null);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch road info';
      setError(prev => ({ ...prev, roadInfo: errorMessage }));
      console.error('Road info fetch error:', err);
    } finally {
      setLoading(prev => ({ ...prev, roadInfo: false }));
    }
  }, [lat, lon, enabled, metrics]);

  // Refetch all data
  const refetch = useCallback(() => {
    if (enabled) {
      fetchFlowSegment();
      fetchIncidents();
      fetchRoadInfo();
    }
  }, [fetchFlowSegment, fetchIncidents, fetchRoadInfo, enabled]);

  // Initial fetch and setup
  useEffect(() => {
    if (enabled) {
      fetchFlowSegment();
      fetchIncidents();
    }
  }, [fetchFlowSegment, fetchIncidents]);

  // Fetch road info after flow segment data is available (for capacity calculations)
  useEffect(() => {
    if (enabled && data.flowSegment) {
      fetchRoadInfo();
    }
  }, [fetchRoadInfo, enabled, data.flowSegment]);

  return {
    data,
    loading,
    error,
    metrics,
    incidentImpact,
    roadCapacity,
    refetch
  };
}