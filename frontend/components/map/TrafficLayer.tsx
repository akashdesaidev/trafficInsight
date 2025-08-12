"use client";

import { useEffect } from "react";
import type { TomTomMap } from "@/types/tomtom";

interface Props {
  visible: boolean;
  map: TomTomMap | null;
}

export default function TrafficLayer({ visible, map }: Props) {
  useEffect(() => {
    if (!visible || !map) return;

    const abort = false;
    const applyLayer = async () => {
      try {
        const res = await fetch("/api/traffic/live-traffic");
        if (!res.ok) return;
        const data = await res.json();
        const template: string = data.tileUrlTemplate;

        // remove existing
        if (map.getSource && map.getSource("traffic-flow")) {
          try {
            map.removeLayer("traffic-flow-layer");
          } catch {}
          map.removeSource("traffic-flow");
        }

        map.addSource("traffic-flow", {
          type: "raster",
          tiles: [template],
          tileSize: 256,
        });
        map.addLayer({
          id: "traffic-flow-layer",
          type: "raster",
          source: "traffic-flow",
          minzoom: 0,
          maxzoom: 22,
        });
      } catch {
        // ignore
      }
    };

    applyLayer();
    const interval = setInterval(applyLayer, 120000);
    return () => {
      clearInterval(interval);
      if (abort) return;
      try {
        if (map?.getSource && map.getSource("traffic-flow")) {
          try {
            map.removeLayer("traffic-flow-layer");
          } catch {}
          map.removeSource("traffic-flow");
        }
      } catch {}
    };
  }, [visible, map]);

  return null;
}
