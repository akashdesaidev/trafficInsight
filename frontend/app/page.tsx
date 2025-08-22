"use client";

import { useState } from "react";
import MapContainer from "@/components/map/MapContainer";
import { AnalyticsPanel } from "@/components/analytics/AnalyticsPanel";
import { ExportPanel } from "@/components/export/ExportPanel";
import { TrafficControlSidebar } from "@/components/sidebar/TrafficControlSidebar";
import LiveLeaderboard from "@/components/chokepoints/LiveLeaderboard";
import { useMapStore } from "@/store/mapStore";
import { Button } from "@/components/ui/button";
import { BarChart3 } from "lucide-react";

export default function Home() {
  const [isAnalyticsPanelOpen, setIsAnalyticsPanelOpen] = useState(false);
  const [isExportPanelOpen, setIsExportPanelOpen] = useState(false);
  const [selectedArea, setSelectedArea] = useState<
    | {
        bbox: [number, number, number, number];
        name?: string;
      }
    | undefined
  >(undefined);
  const [centerMapFunction, setCenterMapFunction] = useState<
    ((coordinates: [number, number], zoom?: number) => void) | null
  >(null);

  const sidebarCollapsed = useMapStore((state) => state.sidebarCollapsed);
  const liveChokepointsVisible = useMapStore(
    (state) => state.liveChokepointsLayer.visible
  );
  const bounds = useMapStore((state) => state.bounds);

  // Use current map bounds as default selection for chokepoints view
  const effectiveArea = selectedArea || (bounds ? { bbox: bounds } : undefined);

  const handleAreaSelect = (
    bbox: [number, number, number, number],
    name?: string
  ) => {
    setSelectedArea({ bbox, name });
    setIsAnalyticsPanelOpen(true);
  };

  const handleMapReady = (
    centerMap: (coordinates: [number, number], zoom?: number) => void
  ) => {
    setCenterMapFunction(() => centerMap);
  };

  const handleChokepointClick = (chokepoint: {
    center: { lat: number; lon: number };
  }) => {
    if (centerMapFunction) {
      centerMapFunction([chokepoint.center.lon, chokepoint.center.lat], 16);
    }
  };

  return (
    <div className="flex w-full h-[calc(100vh-64px)]">
      {/* Sidebar */}
      <div
        className={`hidden md:block max-h-screen overflow-x-hidden overflow-y-auto transition-all duration-200`}
      >
        <TrafficControlSidebar
          selectedArea={liveChokepointsVisible ? effectiveArea : selectedArea}
          onAnalyticsOpen={() => setIsAnalyticsPanelOpen(true)}
          onExportOpen={() => setIsExportPanelOpen(true)}
        />
      </div>

      {/* Main Content */}
      <main
        className={`flex-1 p-2 relative transition-all duration-200 ${
          sidebarCollapsed ? "w-full" : ""
        }`}
      >
        <MapContainer
          onAreaSelect={handleAreaSelect}
          onMapReady={handleMapReady}
        />

        {/* Mobile Analytics Button */}
        <div className="md:hidden absolute top-4 right-4 z-40">
          <Button
            onClick={() => setIsAnalyticsPanelOpen(true)}
            className="flex items-center gap-2 shadow-lg"
            disabled={!selectedArea}
          >
            <BarChart3 className="h-4 w-4" />
            Analytics
          </Button>
        </div>
      </main>

      {/* Live Chokepoints Leaderboard - Conditionally rendered when chokepoints are active */}
      {liveChokepointsVisible && (
        <div className="w-full md:max-w-[480px] p-2 border-l">
          <LiveLeaderboard
            selectedArea={effectiveArea}
            onChokepointClick={handleChokepointClick}
          />
        </div>
      )}

      {/* Analytics Panel */}
      <AnalyticsPanel
        isOpen={isAnalyticsPanelOpen}
        onClose={() => setIsAnalyticsPanelOpen(false)}
        selectedArea={selectedArea}
      />

      {/* Export Panel */}
      <ExportPanel
        isOpen={isExportPanelOpen}
        onClose={() => setIsExportPanelOpen(false)}
        selectedArea={selectedArea}
      />
    </div>
  );
}
