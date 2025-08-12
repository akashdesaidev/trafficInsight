"use client";

import { useEffect, useState } from "react";
import type { TomTomMap } from "@/types/tomtom";

interface Props {
  visible: boolean;
  map: TomTomMap | null;
}

export default function SimpleTrafficOverlay({ visible, map }: Props) {
  const [isMapReady, setIsMapReady] = useState(false);

  // Check if map is ready for layer operations
  useEffect(() => {
    if (!map) {
      setIsMapReady(false);
      return;
    }

    const checkMapReady = () => {
      // Check if map has required methods and is loaded
      if (map.loaded && map.loaded()) {
        setIsMapReady(true);
        return;
      }

      // If map doesn't have loaded() method, check if it's ready by checking for essential methods
      if (map.addSource && map.addLayer && map.getSource) {
        setIsMapReady(true);
        return;
      }

      setIsMapReady(false);
    };

    // Check immediately
    checkMapReady();

    // Listen for load event if available
    if (map.on) {
      const handleLoad = () => {
        setIsMapReady(true);
      };

      map.on('load', handleLoad);
      map.on('styleload', handleLoad);

      return () => {
        if (map.off) {
          map.off('load', handleLoad);
          map.off('styleload', handleLoad);
        }
      };
    }

    // Fallback: check periodically if map becomes ready
    const checkInterval = setInterval(() => {
      if (map.loaded && map.loaded()) {
        setIsMapReady(true);
        clearInterval(checkInterval);
      }
    }, 100);

    return () => clearInterval(checkInterval);
  }, [map]);

  useEffect(() => {
    if (!visible || !map || !isMapReady) {
      // Remove existing traffic layer if not visible or map not ready
      if (map && isMapReady && map.getSource && map.getSource("simple-traffic-flow")) {
        try {
          map.removeLayer("simple-traffic-flow-layer");
        } catch {}
        map.removeSource("simple-traffic-flow");
      }
      return;
    }

    const addTrafficLayer = async () => {
      try {
        // Double-check map is still ready
        if (!map || !isMapReady) {
          console.log("Map not ready, skipping traffic layer addition");
          return;
        }

        // Remove existing layer if present
        if (map.getSource && map.getSource("simple-traffic-flow")) {
          try {
            map.removeLayer("simple-traffic-flow-layer");
          } catch {}
          map.removeSource("simple-traffic-flow");
        }

        // Add traffic tile layer with relative0 style (thickness not supported for relative0)
        map.addSource("simple-traffic-flow", {
          type: "raster",
          tiles: ["/api/traffic/tiles/{z}/{x}/{y}.png?style=relative0"],
          tileSize: 256,
        });

        map.addLayer({
          id: "simple-traffic-flow-layer",
          type: "raster",
          source: "simple-traffic-flow",
          paint: {
            "raster-opacity": 0.9
          },
          minzoom: 0,
          maxzoom: 22,
        });

        console.log("Traffic layer added successfully");
      } catch (error) {
        console.error("Error adding traffic layer:", error);
        // If it's still a timing issue, retry after a short delay
        if (error.message.includes("Style is not done loading")) {
          console.log("Retrying traffic layer addition after delay...");
          setTimeout(() => {
            if (visible && map && isMapReady) {
              addTrafficLayer();
            }
          }, 1000);
        }
      }
    };

    // Add initial layer with a small delay to ensure map is fully ready
    const initialTimeout = setTimeout(() => {
      if (visible && map && isMapReady) {
        addTrafficLayer();
      }
    }, 500);

    // Auto-refresh tiles every 2 minutes
    const interval = setInterval(() => {
      if (visible && map && isMapReady) {
        addTrafficLayer();
      }
    }, 120000);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
      if (map && isMapReady && map.getSource && map.getSource("simple-traffic-flow")) {
        try {
          map.removeLayer("simple-traffic-flow-layer");
        } catch {}
        map.removeSource("simple-traffic-flow");
      }
    };
  }, [visible, map, isMapReady]);

  return null;
}