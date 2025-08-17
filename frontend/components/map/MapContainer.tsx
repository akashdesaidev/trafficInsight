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
import LiveChokepointsMarkers from "@/components/map/LiveChokepointsMarkers";
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
  // Use global state for traffic and incidents
  const trafficLayer = useMapStore((s) => s.trafficLayer);
  const incidentLayer = useMapStore((s) => s.incidentLayer);
  const liveChokepointsLayer = useMapStore((s) => s.liveChokepointsLayer);
  const mapSettings = useMapStore((s) => s.mapSettings);
  const sidebarCollapsed = useMapStore((s) => s.sidebarCollapsed);
  const setTrafficVisible = useMapStore((s) => s.setTrafficVisible);
  const setIncidentsVisible = useMapStore((s) => s.setIncidentsVisible);
  const [routeDrawingEnabled, setRouteDrawingEnabled] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(
    null
  );

  const setCenter = useMapStore((s) => s.setCenter);
  const setZoom = useMapStore((s) => s.setZoom);
  const setBounds = useMapStore((s) => s.setBounds);

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
            coordinates: coordinates,
          },
          properties: {},
        },
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
          "circle-stroke-opacity": 0.4,
        },
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
          "circle-stroke-color": "#FFFFFF",
        },
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

    // Add a small delay to ensure container is properly rendered
    setTimeout(() => {
      if (!isMounted || !mapElementRef.current) return;

      const apiKey = process.env.NEXT_PUBLIC_TOMTOM_API_KEY;
      console.log(
        "TomTom API Key available:",
        !!apiKey,
        "Length:",
        apiKey?.length
      );
      if (!apiKey) {
        setInitError("Missing NEXT_PUBLIC_TOMTOM_API_KEY");
        return;
      }

      // Dynamically import to avoid SSR/global scope issues
      import("@tomtom-international/web-sdk-maps")
        .then((module) => {
          const tt = module as unknown as TomTomModule;
          if (!isMounted || !mapElementRef.current) return;
          console.log(
            "Initializing TomTom map with key:",
            apiKey.substring(0, 4) + "..." + apiKey.substring(apiKey.length - 4)
          );
          console.log("Map container element:", mapElementRef.current);
          const containerDimensions = {
            width: mapElementRef.current?.offsetWidth,
            height: mapElementRef.current?.offsetHeight,
            clientWidth: mapElementRef.current?.clientWidth,
            clientHeight: mapElementRef.current?.clientHeight,
          };
          console.log("Container dimensions:", containerDimensions);

          // Check if container has zero dimensions
          if (!containerDimensions.height || containerDimensions.height === 0) {
            console.error(
              "Map container has zero height! This will prevent the map from rendering."
            );
            setInitError("Map container has no height. Check CSS layout.");
            return;
          }
          const map = tt.default.map({
            key: apiKey,
            container: mapElementRef.current,
            center: [77.5946, 12.9716],
            zoom: 10,
          });
          console.log("TomTom map created successfully:", !!map);

          // Wait for map to be ready
          map.on("load", () => {
            console.log("TomTom map loaded and ready");
            // Force a resize to ensure proper rendering
            setTimeout(() => {
              map.resize();
              console.log("Map resized");
              try {
                const b = map.getBounds?.();
                if (b) {
                  const sw = b.getSouthWest();
                  const ne = b.getNorthEast();
                  setBounds([sw.lng, sw.lat, ne.lng, ne.lat]);
                }
              } catch {}
            }, 100);
          });

          map.on("error", (error) => {
            console.error("TomTom map error:", error);
          });

          // Add basic navigation controls if available
          if (tt?.default?.NavigationControl) {
            map.addControl(new tt.default.NavigationControl());
            console.log("Navigation controls added");
          }

          mapRef.current = map;
          setMap(map); // Also set the state so components re-render

          console.log("Map setup complete");

          const onResize = () => map.resize();
          const onMoveEnd = () => {
            const center = map?.getCenter?.();
            const zoom = map?.getZoom?.();
            if (center && typeof zoom === "number") {
              setCenter([center.lng, center.lat]);
              setZoom(zoom);
            }
            try {
              const b = map.getBounds?.();
              if (b) {
                const sw = b.getSouthWest();
                const ne = b.getNorthEast();
                setBounds([sw.lng, sw.lat, ne.lng, ne.lat]);
              }
            } catch {}
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
    }, 100); // 100ms delay

    return () => {
      isMounted = false;
    };
  }, [setCenter, setZoom]);

  // Handle sidebar toggle - resize map when sidebar collapses/expands
  useEffect(() => {
    if (map && map.resize) {
      // Small delay to ensure layout has updated
      setTimeout(() => {
        map.resize();
        console.log("Map resized due to sidebar toggle:", sidebarCollapsed);
      }, 300);
    }
  }, [map, sidebarCollapsed]);

  return (
    <div className="h-full w-full relative min-h-[400px]">
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
      <div
        ref={mapElementRef}
        className="h-full w-full bg-gray-100 min-h-[400px]"
        style={{ minHeight: "400px", height: "100%", width: "100%" }}
      />

      {/* Overlays */}
      {/* <TrafficLayer visible={showTraffic} map={map} /> */}
      <SimpleTrafficOverlay visible={trafficLayer.visible} map={map} />
      <IncidentMarkers
        visible={incidentLayer.visible}
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
      <LiveChokepointsMarkers
        visible={liveChokepointsLayer.visible}
        map={map}
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

      {/* Old controls panel removed - now using sidebar */}

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
