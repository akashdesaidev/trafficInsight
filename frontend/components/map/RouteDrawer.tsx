"use client";

import { useEffect, useState } from "react";
import { Route, X, Navigation, Clock } from "lucide-react";
import type { TomTomMap } from "@/types/tomtom";

interface Props {
  map: TomTomMap | null;
  enabled: boolean;
  onRouteChange?: (route: RouteData | null) => void;
}

interface RouteData {
  waypoints: [number, number][];
  distance: number;
  duration: number;
  geometry: [number, number][];
}

interface RouteResponse {
  summary: {
    distance: number;
    time: number;
  };
  coordinates: [number, number][];
}

export default function RouteDrawer({ map, enabled, onRouteChange }: Props) {
  const [waypoints, setWaypoints] = useState<[number, number][]>([]);
  const [route, setRoute] = useState<RouteData | null>(null);
  const [loading, setLoading] = useState(false);

  // Handle map clicks to add waypoints
  useEffect(() => {
    if (!map || !enabled) return;

    const handleMapClick = async (e: { lngLat?: { lng: number; lat: number } }) => {
      if (!e.lngLat) return;
      
      const newPoint: [number, number] = [e.lngLat.lng, e.lngLat.lat];
      const newWaypoints = [...waypoints, newPoint];
      setWaypoints(newWaypoints);

      // If we have 2 or more waypoints, calculate route
      if (newWaypoints.length >= 2) {
        await calculateRoute(newWaypoints);
      } else {
        // Just show the waypoint marker
        updateWaypointMarkers(newWaypoints);
      }
    };

    // @ts-expect-error TomTom event types
    map.on("click", handleMapClick);
    
    return () => {
      // @ts-expect-error TomTom event types
      map.off("click", handleMapClick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, enabled, waypoints]);

  const calculateRoute = async (points: [number, number][]) => {
    if (points.length < 2) return;
    
    setLoading(true);
    try {
      const response = await fetch("/api/search/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          waypoints: points,
          travelMode: "car",
          routeType: "fastest",
          traffic: true,
        }),
      });

      if (response.ok) {
        const data: RouteResponse = await response.json();
        const routeData: RouteData = {
          waypoints: points,
          distance: data.summary.distance,
          duration: data.summary.time,
          geometry: data.coordinates,
        };
        
        setRoute(routeData);
        onRouteChange?.(routeData);
        updateRouteDisplay(routeData);
      }
    } catch (error) {
      console.error("Route calculation error:", error);
      // Fallback to straight line
      const routeData: RouteData = {
        waypoints: points,
        distance: calculateStraightLineDistance(points),
        duration: 0,
        geometry: points,
      };
      setRoute(routeData);
      onRouteChange?.(routeData);
      updateRouteDisplay(routeData);
    } finally {
      setLoading(false);
    }
  };

  const updateWaypointMarkers = (points: [number, number][]) => {
    if (!map) return;

    // Remove existing markers
    const sourceId = "route-waypoints";
    const layerId = "route-waypoints-layer";
    
    if (map.getSource && map.getSource(sourceId)) {
      try {
        map.removeLayer(layerId);
      } catch {}
      map.removeSource(sourceId);
    }

    if (points.length === 0) return;

    const features = points.map((point, index) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: point,
      },
      properties: {
        index,
        isStart: index === 0,
        isEnd: index === points.length - 1,
      },
    }));

    map.addSource(sourceId, {
      type: "geojson",
      data: { type: "FeatureCollection", features },
    });

    map.addLayer({
      id: layerId,
      type: "circle",
      source: sourceId,
      paint: {
        "circle-radius": 8,
        "circle-color": [
          "case",
          ["get", "isStart"], "#22c55e", // Green for start
          ["get", "isEnd"], "#ef4444", // Red for end
          "#3b82f6" // Blue for waypoints
        ],
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
      },
    });

    // Add labels
    map.addLayer({
      id: `${layerId}-labels`,
      type: "symbol",
      source: sourceId,
      layout: {
        "text-field": [
          "case",
          ["get", "isStart"], "A",
          ["get", "isEnd"], "B",
          ["+", ["get", "index"], 1]
        ],
        "text-size": 12,
        "text-font": ["Open Sans Regular"],
      },
      paint: {
        "text-color": "#ffffff",
      },
    });
  };

  const updateRouteDisplay = (routeData: RouteData) => {
    if (!map) return;

    // Remove existing route
    const routeSourceId = "route-line";
    const routeLayerId = "route-line-layer";
    
    if (map.getSource && map.getSource(routeSourceId)) {
      try {
        map.removeLayer(routeLayerId);
      } catch {}
      map.removeSource(routeSourceId);
    }

    // Add route line
    map.addSource(routeSourceId, {
      type: "geojson",
      data: {
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: routeData.geometry,
        },
        properties: {},
      },
    });

    map.addLayer({
      id: routeLayerId,
      type: "line",
      source: routeSourceId,
      layout: {
        "line-join": "round",
        "line-cap": "round",
      },
      paint: {
        "line-color": "#3b82f6",
        "line-width": 4,
        "line-opacity": 0.8,
      },
    });

    // Update waypoint markers
    updateWaypointMarkers(routeData.waypoints);
  };

  const clearRoute = () => {
    if (!map) return;

    // Remove all route-related layers and sources
    const layersToRemove = ["route-line-layer", "route-waypoints-layer", "route-waypoints-layer-labels"];
    const sourcesToRemove = ["route-line", "route-waypoints"];

    layersToRemove.forEach(layerId => {
      try {
        map.removeLayer(layerId);
      } catch {}
    });

    sourcesToRemove.forEach(sourceId => {
      if (map.getSource && map.getSource(sourceId)) {
        map.removeSource(sourceId);
      }
    });

    setWaypoints([]);
    setRoute(null);
    onRouteChange?.(null);
  };

  // Clean up when disabled
  useEffect(() => {
    if (!enabled) {
      clearRoute();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // Utility function for straight line distance
  const calculateStraightLineDistance = (points: [number, number][]): number => {
    if (points.length < 2) return 0;
    
    let totalDistance = 0;
    for (let i = 1; i < points.length; i++) {
      const [lon1, lat1] = points[i - 1];
      const [lon2, lat2] = points[i];
      
      // Haversine formula
      const R = 6371000; // Earth's radius in meters
      const φ1 = lat1 * Math.PI / 180;
      const φ2 = lat2 * Math.PI / 180;
      const Δφ = (lat2 - lat1) * Math.PI / 180;
      const Δλ = (lon2 - lon1) * Math.PI / 180;

      const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
                Math.cos(φ1) * Math.cos(φ2) *
                Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

      totalDistance += R * c;
    }
    
    return Math.round(totalDistance);
  };

  const formatDistance = (meters: number): string => {
    if (meters < 1000) return `${meters}m`;
    return `${(meters / 1000).toFixed(1)}km`;
  };

  const formatDuration = (seconds: number): string => {
    if (seconds === 0) return "N/A";
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes}min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}min`;
  };

  if (!enabled) return null;

  return (
    <div className="absolute top-20 right-4 z-10 bg-white/90 dark:bg-black/60 backdrop-blur rounded-md shadow border p-3 space-y-3 min-w-64">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Route className="h-4 w-4 text-blue-600" />
          <span className="text-sm font-medium">Route Planning</span>
        </div>
        <button
          onClick={clearRoute}
          className="text-gray-400 hover:text-gray-600"
          title="Clear route"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="text-xs text-gray-600 dark:text-gray-400">
        Click on the map to add waypoints
      </div>

      {waypoints.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-gray-700 dark:text-gray-300">
            Waypoints: {waypoints.length}
          </div>
          
          {route && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm">
                <Navigation className="h-3 w-3 text-green-600" />
                <span>{formatDistance(route.distance)}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-3 w-3 text-blue-600" />
                <span>{formatDuration(route.duration)}</span>
              </div>
            </div>
          )}
          
          {loading && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <div className="animate-spin rounded-full h-3 w-3 border-b border-blue-500"></div>
              <span>Calculating route...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}