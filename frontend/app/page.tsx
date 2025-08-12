"use client";

import { useState } from "react";
import MapContainer from "@/components/map/MapContainer";
import { AnalyticsPanel } from "@/components/analytics/AnalyticsPanel";
import { Button } from "@/components/ui/button";
import { BarChart3 } from "lucide-react";

export default function Home() {
  const [isAnalyticsPanelOpen, setIsAnalyticsPanelOpen] = useState(false);
  const [selectedArea, setSelectedArea] = useState<{
    bbox: [number, number, number, number];
    name?: string;
  } | undefined>(undefined);

  const handleAreaSelect = (bbox: [number, number, number, number], name?: string) => {
    setSelectedArea({ bbox, name });
    setIsAnalyticsPanelOpen(true);
  };

  return (
    <main className="w-full relative">
      <MapContainer onAreaSelect={handleAreaSelect} />
      
      {/* Analytics Toggle Button */}
      <div className="absolute top-4 right-4 z-40">
        <Button
          onClick={() => setIsAnalyticsPanelOpen(true)}
          className="flex items-center gap-2 shadow-lg"
          disabled={!selectedArea}
        >
          <BarChart3 className="h-4 w-4" />
          Analytics
        </Button>
      </div>

      {/* Analytics Panel */}
      <AnalyticsPanel
        isOpen={isAnalyticsPanelOpen}
        onClose={() => setIsAnalyticsPanelOpen(false)}
        selectedArea={selectedArea}
      />
    </main>
  );
}
