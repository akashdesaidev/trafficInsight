"use client";

import { useEffect, useRef, useState } from "react";
import { useMapStore } from "@/store/mapStore";
import type { TomTomMap } from "@/types/tomtom";
import TrafficLayer from "@/components/map/TrafficLayer";
import SimpleTrafficOverlay from "@/components/map/SimpleTrafficOverlay";
import TrafficTestComponent from "@/components/map/TrafficTestComponent";
import IncidentMarkers from "@/components/map/IncidentMarkers";
import IncidentPopup from "@/components/map/IncidentPopup";
import RouteDrawer from "@/components/map/RouteDrawer";
import LocationSearch from "@/components/search/LocationSearch";
import "@tomtom-international/web-sdk-maps/dist/maps.css";

type TomTomModule = {
  default: {
    map: (options: {
      key: string;
      container: HTMLElement;
      center: [number, number];
      zoom: number;
    }) => TomTomMap;
    NavigationControl?: new () => unknown;
  };
};

// using TomTomMap from types/tomtom

interface MapContainerProps {
  onAreaSelect?: (
    bbox: [number, number, number, number],
    name?: string
  ) => void;
}

export default function MapContainer({ onAreaSelect }: MapContainerProps) {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<TomTomMap | null>(null);
  const [map, setMap] = useState<TomTomMap | null>(null);
  const [initError, setInitError] = useState<string | null>(null);
  const [showTraffic, setShowTraffic] = useState(true);
  const [showIncidents, setShowIncidents] = useState(true);
  const [routeDrawingEnabled, setRouteDrawingEnabled] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);

  const setCenter = useMapStore((s) => s.setCenter);
  const setZoom = useMapStore((s) => s.setZoom);

  const addLocationMarker = (coordinates: [number, number]) => {
    if (!map) return;
    
    try {
      // Remove existing location marker if present
      if (map.getSource && map.getSource("user-location")) {
        try {
          map.removeLayer("user-location-layer");
          map.removeLayer("user-location-accuracy-layer");
        } catch {}
        map.removeSource("user-location");
      }

      // Add user location source
      map.addSource("user-location", {
        type: "geojson",
        data: {
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: coordinates
          },
          properties: {}
        }
      });

      // Add accuracy circle layer (light blue circle)
      map.addLayer({
        id: "user-location-accuracy-layer",
        type: "circle",
        source: "user-location",
        paint: {
          "circle-radius": 20,
          "circle-color": "#4285F4",
          "circle-opacity": 0.2,
          "circle-stroke-width": 1,
          "circle-stroke-color": "#4285F4",
          "circle-stroke-opacity": 0.4
        }
      });

      // Add location dot layer (blue dot with white border)
      map.addLayer({
        id: "user-location-layer",
        type: "circle",
        source: "user-location",
        paint: {
          "circle-radius": 8,
          "circle-color": "#4285F4",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#FFFFFF"
        }
      });
    } catch (error) {
      console.error("Error adding location marker:", error);
    }
  };

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by this browser.");
      return;
    }

    setIsLocating(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        
        if (map && map.setCenter && map.setZoom) {
          // Center map on user's location
          map.setCenter([longitude, latitude]);
          map.setZoom(16); // Zoom in for better view
          
          // Update store
          setCenter([longitude, latitude]);
          setZoom(16);
          
          // Set user location for marker
          setUserLocation([longitude, latitude]);
          
          // Add location marker
          addLocationMarker([longitude, latitude]);
        }
        
        setIsLocating(false);
      },
      (error) => {
        let errorMessage = "Unable to retrieve your location.";
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = "Location access denied by user.";
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = "Location information is unavailable.";
            break;
          case error.TIMEOUT:
            errorMessage = "Location request timed out.";
            break;
        }
        alert(errorMessage);
        setIsLocating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000, // Cache for 5 minutes
      }
    );
  };

  useEffect(() => {
    let isMounted = true;
    if (!mapElementRef.current || mapRef.current) return;

    const apiKey = process.env.NEXT_PUBLIC_TOMTOM_API_KEY;
    if (!apiKey) {
      setInitError("Missing NEXT_PUBLIC_TOMTOM_API_KEY");
      return;
    }

    // Dynamically import to avoid SSR/global scope issues
    import("@tomtom-international/web-sdk-maps")
      .then((module) => {
        const tt = module as unknown as TomTomModule;
        if (!isMounted || !mapElementRef.current) return;
        const map = tt.default.map({
          key: apiKey,
          container: mapElementRef.current,
          center: [77.5946, 12.9716],
          zoom: 10,
        });

        // Add basic navigation controls if available
        if (tt?.default?.NavigationControl) {
          map.addControl(new tt.default.NavigationControl());
        }

        mapRef.current = map;
        setMap(map); // Also set the state so components re-render

        const onResize = () => map.resize();
        const onMoveEnd = () => {
          const center = map?.getCenter?.();
          const zoom = map?.getZoom?.();
          if (center && typeof zoom === "number") {
            setCenter([center.lng, center.lat]);
            setZoom(zoom);
          }
        };
        window.addEventListener("resize", onResize);
        // @ts-expect-error tomtom types are not available
        map.on("moveend", onMoveEnd);

        return () => {
          window.removeEventListener("resize", onResize);
          if (map.off) {
            map.off("moveend", onMoveEnd as unknown as () => void);
          }
          map.remove();
          mapRef.current = null;
          setMap(null); // Also clear the state
        };
      })
      .catch((err) => {
        if (isMounted) setInitError((err as Error).message);
      });

    return () => {
      isMounted = false;
    };
  }, [setCenter, setZoom]);

  return (
    <div className="h-[calc(100vh-64px)] w-full relative">
      {!process.env.NEXT_PUBLIC_TOMTOM_API_KEY ? (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-red-600">
          Set NEXT_PUBLIC_TOMTOM_API_KEY to load the map
        </div>
      ) : null}
      {initError ? (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-red-600">
          {initError}
        </div>
      ) : null}
      <div ref={mapElementRef} className="h-full w-full" />
      {/* Overlays */}
      {/* <TrafficLayer visible={showTraffic} map={map} /> */}
      <SimpleTrafficOverlay visible={showTraffic} map={map} />
      <IncidentMarkers
        visible={showIncidents}
        map={map}
        bboxProvider={() => {
          const m = map;
          if (!m?.getBounds) return null;
          const b = m.getBounds();
          const sw = b.getSouthWest();
          const ne = b.getNorthEast();
          return `${sw.lng},${sw.lat},${ne.lng},${ne.lat}`;
        }}
      />
      <IncidentPopup map={map} />
      <RouteDrawer
        map={map}
        enabled={routeDrawingEnabled}
        onRouteChange={() => {
          // Handle route changes if needed
        }}
      />

      {/* Search Box */}
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-10">
        <LocationSearch />
      </div>

      {/* Controls Panel */}
      <div className="absolute top-4 left-4 z-10 bg-white/90 dark:bg-black/60 backdrop-blur rounded-md shadow border p-2 space-y-2 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={showTraffic}
            onChange={(e) => setShowTraffic(e.target.checked)}
          />
          Traffic flow
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={showIncidents}
            onChange={(e) => setShowIncidents(e.target.checked)}
          />
          Incidents
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={routeDrawingEnabled}
            onChange={(e) => setRouteDrawingEnabled(e.target.checked)}
          />
          Route drawing
        </label>
        {onAreaSelect && (
          <button
            className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors"
            onClick={() => {
              if (map?.getBounds) {
                const bounds = map.getBounds();
                const sw = bounds.getSouthWest();
                const ne = bounds.getNorthEast();
                const bbox: [number, number, number, number] = [
                  sw.lng,
                  sw.lat,
                  ne.lng,
                  ne.lat,
                ];
                onAreaSelect(bbox, "Selected Area");
              }
            }}
          >
            Select Area for Analytics
          </button>
        )}
      </div>

      {/* Current Location Button - Bottom Right (Google Maps style) */}
      <button
        className={`absolute bottom-6 right-6 z-10 w-12 h-12 rounded-full shadow-lg transition-all duration-200 flex items-center justify-center ${
          isLocating 
            ? "bg-gray-400 cursor-not-allowed" 
            : "bg-white hover:bg-gray-50 active:bg-gray-100 hover:shadow-xl"
        }`}
        onClick={getCurrentLocation}
        disabled={isLocating}
        title="Show your location"
      >
        {isLocating ? (
          <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full"></div>
        ) : (
          <div className="w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-sm"></div>
        )}
      </button>

      {/* Debug Component - Remove this after testing */}
      {/* <TrafficTestComponent visible={showTraffic} /> */}
    </div>
  );
}
