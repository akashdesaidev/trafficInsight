// components/MapContainer.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useMapStore } from "@/store/mapStore";

// Import custom hooks
import { useTomTomMap } from "@/hooks/useTomTomMap";
import { useMapInteractions } from "@/hooks/useMapInteractions";
import { useUserLocation } from "@/hooks/useUserLocation";

// Import child components
import SimpleTrafficOverlay from "@/components/map/SimpleTrafficOverlay";
import IncidentMarkers from "@/components/map/IncidentMarkers";
import IncidentPopup from "@/components/map/IncidentPopup";
import LocationSearch from "@/components/search/LocationSearch";
import { RouteDirections } from "@/components/route/RouteDirections";

import "@tomtom-international/web-sdk-maps/dist/maps.css";

export default function MapContainer() {
  const mapElementRef = useRef<HTMLDivElement | null>(null);

  // Global state from Zustand store
  const { trafficLayer, incidentLayer, sidebarCollapsed } = useMapStore();

  // State for routing
  const [routeDestination, setRouteDestination] = useState<{
    lat: number;
    lon: number;
    name: string;
  } | null>(null);

  // Custom hooks for map logic
  const { map, isMapReady, initError } = useTomTomMap(mapElementRef);
  const { addLocationMarker } = useMapInteractions(map, isMapReady);
  const { userLocation, isLocating, requestUserLocation } = useUserLocation(
    map,
    addLocationMarker
  );

  // Effect to resize map when sidebar toggles
  useEffect(() => {
    if (isMapReady && map) {
      // Delay resize to allow for CSS transition of the sidebar
      const timer = setTimeout(() => map.resize(), 300);
      return () => clearTimeout(timer);
    }
  }, [isMapReady, map, sidebarCollapsed]);

  

  const getMapBounds = () => {
    if (!map?.getBounds) return null;
    const b = map.getBounds();
    const sw = b.getSouthWest();
    const ne = b.getNorthEast();
    return `${sw.lng},${sw.lat},${ne.lng},${ne.lat}`;
  };

  return (
    <div className="h-full w-full relative min-h-[400px]">
      <div ref={mapElementRef} className="h-full w-full bg-gray-100" />

      {initError && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-red-600 bg-white/70">
          Error: {initError}
        </div>
      )}

      {/* Map Overlays and Components */}
      {isMapReady && map && (
        <>
          <SimpleTrafficOverlay visible={trafficLayer.visible} map={map} />
          <IncidentMarkers
            visible={incidentLayer.visible}
            map={map}
            bboxProvider={getMapBounds}
          />
          <IncidentPopup map={map} />
        </>
      )}

      {/* UI Controls */}
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-20 w-full max-w-md px-4">
        <LocationSearch onRouteRequest={setRouteDestination} />
      </div>

      <button
        className={`absolute bottom-6 right-6 z-10 w-12 h-12 rounded-full shadow-lg transition-all duration-200 flex items-center justify-center ${
          isLocating
            ? "bg-gray-400 cursor-not-allowed"
            : "bg-white hover:bg-gray-100"
        }`}
        onClick={requestUserLocation}
        disabled={isLocating}
        title="Show your location"
      >
        {isLocating ? (
          <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full" />
        ) : (
          <div className="w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-sm" />
        )}
      </button>

      {routeDestination && (
        <div className="absolute top-20 left-4 z-10 sm:w-96 max-h-[calc(100vh-120px)] overflow-auto">
          <RouteDirections
            destination={routeDestination}
            onClose={() => setRouteDestination(null)}
            userLocation={
              userLocation
                ? { lat: userLocation[1], lon: userLocation[0] }
                : null
            }
          />
        </div>
      )}
    </div>
  );
}
