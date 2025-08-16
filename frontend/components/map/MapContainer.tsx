// components/MapContainer.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import tt from "@tomtom-international/web-sdk-maps";
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
import LiveChokepointsDashboard from "@/components/chokepoints/LiveChokepointsDashboard";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

import "@tomtom-international/web-sdk-maps/dist/maps.css";

export default function MapContainer() {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const markerRef = useRef<tt.Marker | null>(null);
  const chokepointMarkerRef = useRef<tt.Marker | null>(null);

  // Global state from Zustand store
  const { trafficLayer, incidentLayer, sidebarCollapsed } = useMapStore();

  // State for routing
  const [routeDestination, setRouteDestination] = useState<{
    lat: number;
    lon: number;
    name: string;
  } | null>(null);

  // State for on-map congestion analysis
  const [clickedPoint, setClickedPoint] = useState<{ lat: number; lng: number } | null>(
    null
  );
  const [isCongestionSheetOpen, setIsCongestionSheetOpen] = useState(false);

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

  // Effect to handle map clicks for congestion analysis
  useEffect(() => {
    if (!map) return;

    const handleMapClick = (e: any) => {
      const lngLat = e.lngLat;
      setClickedPoint(lngLat);
      setIsCongestionSheetOpen(true);

      // Remove previous markers if they exist
      if (markerRef.current) {
        markerRef.current.remove();
      }
      if (chokepointMarkerRef.current) {
        chokepointMarkerRef.current.remove();
        chokepointMarkerRef.current = null;
      }

      // Add a new marker to the map
      const newMarker = new tt.Marker({
        color: "#007bff", // A distinct color for the selected point
      })
        .setLngLat(lngLat)
        .addTo(map);

      markerRef.current = newMarker;
    };

    map.on("click", handleMapClick);

    return () => {
      map.off("click", handleMapClick);
      // Clean up marker when component unmounts
      if (markerRef.current) {
        markerRef.current.remove();
      }
    };
  }, [map]);

  const handleChokepointSelect = (
    location: { lat: number; lon: number } | null
  ) => {
    if (chokepointMarkerRef.current) {
      chokepointMarkerRef.current.remove();
    }

    if (location && map) {
      const newMarker = new tt.Marker({ color: "#E63946" }) // A distinct red color
        .setLngLat([location.lon, location.lat])
        .addTo(map);

      chokepointMarkerRef.current = newMarker;
      map.flyTo({ center: [location.lon, location.lat], zoom: 15 });
    }
  };

  // Effect to remove marker when sheet is closed
  useEffect(() => {
    if (!isCongestionSheetOpen) {
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
      if (chokepointMarkerRef.current) {
        chokepointMarkerRef.current.remove();
        chokepointMarkerRef.current = null;
      }
      setClickedPoint(null);
    }
  }, [isCongestionSheetOpen]);

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

      <Sheet
        open={isCongestionSheetOpen}
        onOpenChange={setIsCongestionSheetOpen}
      >
        <SheetContent side="bottom" className="h-3/4 flex flex-col">
          <SheetHeader className="px-4 pt-4">
            <SheetTitle>Congestion Analysis</SheetTitle>
          </SheetHeader>
          <div className="flex-grow min-h-0">
            {clickedPoint && (
              <LiveChokepointsDashboard
                center={clickedPoint}
                onChokepointSelect={handleChokepointSelect}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
