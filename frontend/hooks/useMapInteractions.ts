// hooks/useMapInteractions.ts
"use client";

import { useCallback, useEffect } from "react";
import { useMapStore } from "@/store/mapStore";
import type { TomTomMap } from "@/types/tomtom";

type MarkerType = "user" | "search";

const MARKER_CONFIG = {
  user: {
    sourceId: "user-location-source",
    accuracyLayerId: "user-location-accuracy-layer",
    dotLayerId: "user-location-dot-layer",
    primaryColor: "#4285F4",
    dotRadius: 8,
    accuracyRadius: 20,
  },
  search: {
    sourceId: "search-location-source",
    accuracyLayerId: "search-location-accuracy-layer",
    dotLayerId: "search-location-dot-layer",
    primaryColor: "#E53935",
    dotRadius: 10,
    accuracyRadius: 15,
  },
};

export function useMapInteractions(map: TomTomMap | null, isMapReady: boolean) {
  const selectedLocation = useMapStore((s) => s.selectedLocation);

  const addLocationMarker = useCallback(
    (coordinates: [number, number], type: MarkerType) => {
      if (!map) return;

      const config = MARKER_CONFIG[type];

      // Use type-safe map methods to check existence before removing
      if (map.getLayer(config.dotLayerId)) map.removeLayer(config.dotLayerId);
      if (map.getLayer(config.accuracyLayerId))
        map.removeLayer(config.accuracyLayerId);
      if (map.getSource(config.sourceId)) map.removeSource(config.sourceId);

      map.addSource(config.sourceId, {
        type: "geojson",
        data: {
          type: "Feature",
          geometry: { type: "Point", coordinates },
          properties: {},
        },
      });

      map.addLayer({
        id: config.accuracyLayerId,
        type: "circle",
        source: config.sourceId,
        paint: {
          "circle-radius": config.accuracyRadius,
          "circle-color": config.primaryColor,
          "circle-opacity": 0.2,
          "circle-stroke-width": 1,
          "circle-stroke-color": config.primaryColor,
          "circle-stroke-opacity": 0.4,
        },
      });

      map.addLayer({
        id: config.dotLayerId,
        type: "circle",
        source: config.sourceId,
        paint: {
          "circle-radius": config.dotRadius,
          "circle-color": config.primaryColor,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#FFFFFF",
        },
      });
    },
    [map]
  );

  // Effect to handle selected location from search
  useEffect(() => {
    if (isMapReady && map && selectedLocation) {
      const { lon, lat } = selectedLocation;
      map.flyTo({ center: [lon, lat], zoom: 16 });
      addLocationMarker([lon, lat], "search");
    }
  }, [isMapReady, map, selectedLocation, addLocationMarker]);

  return { addLocationMarker };
}
