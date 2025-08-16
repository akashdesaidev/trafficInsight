// hooks/useTomTomMap.ts
"use client";

import { useEffect, useRef, useState } from "react";
import { useMapStore } from "@/store/mapStore";
import type { TomTomMap } from "@/types/tomtom";

type TomTomModule = {
  default: {
    map: (options: object) => TomTomMap;
    NavigationControl?: new () => unknown;
  };
};

export function useTomTomMap(
  mapElementRef: React.RefObject<HTMLDivElement | null>
) {
  const mapRef = useRef<TomTomMap | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const { setCenter, setZoom } = useMapStore();

  useEffect(() => {
    let isMounted = true;
    if (!mapElementRef.current || mapRef.current) return;

    const apiKey = process.env.NEXT_PUBLIC_TOMTOM_API_KEY;
    if (!apiKey) {
      setInitError("Missing NEXT_PUBLIC_TOMTOM_API_KEY");
      return;
    }

    const initMap = async () => {
      try {
        const tt = (await import(
          "@tomtom-international/web-sdk-maps"
        )) as unknown as TomTomModule;

        if (!isMounted || !mapElementRef.current) return;

        if (mapElementRef.current.offsetHeight === 0) {
          console.error(
            "Map container has zero height, which can prevent rendering."
          );
          setInitError("Map container has no height. Check CSS layout.");
          return;
        }

        const mapInstance = tt.default.map({
          key: apiKey,
          container: mapElementRef.current,
          center: [77.5946, 12.9716], // Default center
          zoom: 10,
        });
        if (!mapInstance) {
          setInitError("Failed to create TomTom map instance.");
          return;
        }

        if (tt.default.NavigationControl) {
          mapInstance.addControl(new tt.default.NavigationControl());
        }

        const onMoveEnd = () => {
          const center =
            mapInstance && mapInstance.getCenter && mapInstance.getCenter();
          const zoom =
            mapInstance && mapInstance.getZoom && mapInstance.getZoom();
          if (center && typeof zoom === "number") {
            setCenter([center.lng, center.lat]);
            setZoom(zoom);
          }
        };

        mapInstance &&
          mapInstance.on &&
          mapInstance.on("load", () => {
            if (!isMounted) return;
            mapRef.current = mapInstance;
            setIsMapReady(true);
            mapInstance &&
              mapInstance.on &&
              mapInstance.on("moveend", onMoveEnd);
            // A resize is often needed after initial load to ensure correct dimensions
            setTimeout(() => mapInstance.resize(), 100);
          });

        mapInstance &&
          mapInstance.on &&
          mapInstance.on("error", (e) => {
            console.error("TomTom Map Error:", e);
            setInitError("Failed to load map tiles.");
          });

        // Cleanup
        return () => {
          mapInstance &&
            mapInstance.off &&
            mapInstance.off("moveend", onMoveEnd);
          mapInstance.remove();
        };
      } catch (error) {
        if (isMounted) {
          console.error("Failed to initialize TomTom map:", error);
          setInitError((error as Error).message);
        }
      }
    };

    // Delay initialization slightly to ensure the container is fully rendered.
    const timerId = setTimeout(initMap, 100);

    return () => {
      isMounted = false;
      clearTimeout(timerId);
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [mapElementRef, setCenter, setZoom]);

  return { map: mapRef.current, isMapReady, initError };
}
