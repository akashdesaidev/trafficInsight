"use client";

import { useState } from "react";
import MapContainer from "@/components/map/MapContainer";
import { AnalyticsPanel } from "@/components/analytics/AnalyticsPanel";
import { ExportPanel } from "@/components/export/ExportPanel";
import { TrafficControlSidebar } from "@/components/sidebar/TrafficControlSidebar";
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
  const sidebarCollapsed = useMapStore((state) => state.sidebarCollapsed);

  const handleAreaSelect = (
    bbox: [number, number, number, number],
    name?: string
  ) => {
    setSelectedArea({ bbox, name });
    setIsAnalyticsPanelOpen(true);
  };

  return (
    <div className="flex w-full h-[calc(100vh-64px)]">
      {/* Sidebar */}
      <div
        className={`hidden md:block max-h-screen overflow-x-hidden overflow-y-auto transition-all duration-200`}
      >
        <TrafficControlSidebar
          selectedArea={selectedArea}
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
        <MapContainer onAreaSelect={handleAreaSelect} />

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
