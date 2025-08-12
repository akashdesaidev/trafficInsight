"use client";

import { useEffect } from "react";
import type { TomTomMap } from "@/types/tomtom";

interface Props {
  map: TomTomMap | null;
  layerId?: string;
}

export default function IncidentPopup({
  map,
  layerId = "incident-markers-layer",
}: Props) {
  useEffect(() => {
    if (!map) return;
    const onClick = (e: unknown) => {
      const evt = e as {
        features?: Array<{
          geometry?: { coordinates?: [number, number] };
          properties?: Record<string, unknown>;
        }>;
      };
      const features = evt?.features ?? [];
      const f = features[0];
      if (!f) return;
      const coords = f.geometry?.coordinates ?? null;
      const { title, description } = f.properties ?? {};
      if (!coords) return;
      import("@tomtom-international/web-sdk-maps").then((mod) => {
        interface PopupInstance {
          setLngLat(c: [number, number]): PopupInstance;
          setHTML(h: string): PopupInstance;
          addTo(m: TomTomMap): PopupInstance;
        }
        interface TTWithPopup {
          Popup: new (opts: { closeOnClick?: boolean }) => PopupInstance;
        }
        const tt = mod.default as unknown as TTWithPopup;
        new tt.Popup({ closeOnClick: true })
          .setLngLat(coords as [number, number])
          .setHTML(
            `<div style=\"max-width:240px\"><strong>${
              title ?? "Incident"
            }</strong><div>${description ?? ""}</div></div>`
          )
          .addTo(map);
      });
    };

    // @ts-expect-error tomtom event signature
    map.on("click", layerId, onClick);
    return () => {
      try {
        // @ts-expect-error tomtom event signature
        map.off("click", layerId, onClick);
      } catch {}
    };
  }, [map, layerId]);

  return null;
}
