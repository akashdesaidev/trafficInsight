"use client";

import { useEffect } from "react";
import type { TomTomMap } from "@/types/tomtom";

interface Props {
  visible: boolean;
  bboxProvider?: () => string | null;
  map: TomTomMap | null;
}

export default function IncidentMarkers({ visible, bboxProvider, map }: Props) {
  useEffect(() => {
    if (!visible || !map) return;

    const placeMarkers = async () => {
      try {
        const bbox = bboxProvider?.() ?? null;
        if (!bbox) return;
        const res = await fetch(
          `/api/traffic/traffic-incidents?bbox=${encodeURIComponent(bbox)}`
        );

        if (!res.ok) return;
        const data = await res.json();
        const incidents: {
          id: string;
          description?: string;
          type?: string;
          geometry?: { type: string; coordinates: [number, number] };
        }[] = data?.incidents ?? [];

        // clear previous
        const layerId = "incident-markers-layer";
        const sourceId = "incident-markers";
        if (map.getSource && map.getSource(sourceId)) {
          try {
            map.removeLayer(layerId);
          } catch {}
          map.removeSource(sourceId);
        }

        const features = incidents.map((i) => ({
          type: "Feature",
          geometry: i.geometry ?? { type: "Point", coordinates: [0, 0] },
          properties: {
            id: i.id,
            title: i.type ?? "Incident",
            description: i.description ?? "",
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
            "circle-radius": 6,
            "circle-color": "#ef4444",
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 1.5,
          },
        });
      } catch {
        // ignore
      }
    };

    placeMarkers();
    const interval = setInterval(placeMarkers, 120000);
    return () => clearInterval(interval);
  }, [visible, bboxProvider, map]);

  return null;
}
