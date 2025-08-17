"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import LiveLeaderboard from "@/components/chokepoints/LiveLeaderboard";
import MapContainer from "@/components/map/MapContainer";
import { TrafficControlSidebar } from "@/components/sidebar/TrafficControlSidebar";
import { useMapStore } from "@/store/mapStore";

export default function LiveChokepointsPage() {
  const [selectedArea, setSelectedArea] = useState<{
    bbox: [number, number, number, number];
    name?: string;
  } | undefined>(undefined);
  const [centerMapFunction, setCenterMapFunction] = useState<((coordinates: [number, number], zoom?: number) => void) | null>(null);
  const bounds = useMapStore((s) => s.bounds);

  // Use current map bounds as default selection for city-level view
  const effectiveArea = selectedArea || (bounds ? { bbox: bounds } : undefined);

  const handleAreaSelect = (
    bbox: [number, number, number, number],
    name?: string
  ) => {
    setSelectedArea({ bbox, name });
  };

  const handleMapReady = (centerMap: (coordinates: [number, number], zoom?: number) => void) => {
    setCenterMapFunction(() => centerMap);
  };

  const handleChokepointClick = (chokepoint: { center: { lat: number; lon: number } }) => {
    if (centerMapFunction) {
      centerMapFunction([chokepoint.center.lon, chokepoint.center.lat], 16);
    }
  };

  return (
    <div className="flex w-full h-[calc(100vh-64px)]">
      {/* Traffic Control Sidebar */}
      <div className="w-80 border-r">
        <TrafficControlSidebar selectedArea={effectiveArea} />
      </div>
      
      {/* Main Map Area */}
      <main className="flex-1 p-2 relative">
        <MapContainer onAreaSelect={handleAreaSelect} onMapReady={handleMapReady} />
      </main>
      
      {/* Live Leaderboard */}
      <div className="w-full md:w-[480px] p-2 border-l">
        <LiveLeaderboard selectedArea={effectiveArea} onChokepointClick={handleChokepointClick} />
      </div>
    </div>
  );
}


