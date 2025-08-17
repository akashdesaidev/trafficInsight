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
  const bounds = useMapStore((s) => s.bounds);

  // Use current map bounds as default selection for city-level view
  const effectiveArea = selectedArea || (bounds ? { bbox: bounds } : undefined);

  const handleAreaSelect = (
    bbox: [number, number, number, number],
    name?: string
  ) => {
    setSelectedArea({ bbox, name });
  };

  return (
    <div className="flex w-full h-[calc(100vh-64px)]">
      {/* Traffic Control Sidebar */}
      <div className="w-80 border-r">
        <TrafficControlSidebar selectedArea={effectiveArea} />
      </div>
      
      {/* Main Map Area */}
      <main className="flex-1 p-2 relative">
        <MapContainer onAreaSelect={handleAreaSelect} />
      </main>
      
      {/* Live Leaderboard */}
      <div className="w-full md:w-[480px] p-2 border-l">
        <LiveLeaderboard selectedArea={effectiveArea} />
      </div>
    </div>
  );
}


