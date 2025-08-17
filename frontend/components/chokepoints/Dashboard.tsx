"use client";

import { useState, useEffect } from "react";
import { MapPin, TrendingUp, Clock, AlertTriangle } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";

import { ChokepointDetailModal } from "./DetailModal";
import LiveLeaderboard from "./LiveLeaderboard";

interface ChokepointDashboardProps {
  selectedArea?: {
    bbox: [number, number, number, number];
    name?: string;
  };
  onChokepointSelect?: (chokepoint: Chokepoint) => void;
}

interface Chokepoint {
  id: number;
  location: {
    lat: number;
    lon: number;
  };
  road_name: string;
  segment_id: string;
  congestion_score: number;
  rank: number;
  avg_delay_minutes: number;
  max_delay_minutes: number;
  frequency_score: number;
  intensity_score: number;
  duration_score: number;
  peak_periods: Array<{
    start: string;
    end: string;
    severity: number;
    avg_delay_minutes?: number;
  }>;
  worst_hour: number;
  worst_day: number;
  last_updated: string | null;
  total_observations: number;
  data_quality_score: number;
}

interface ChokepointSummary {
  total_chokepoints: number;
  average_congestion_score: number;
  severity_distribution: Record<string, { count: number; percentage: number }>;
  top_roads: Array<{
    road_name: string;
    avg_congestion_score: number;
    chokepoint_count: number;
  }>;
  last_analysis: string | null;
  bbox: string | null;
}

const severityColors = {
  "Low": "bg-green-100 text-green-800",
  "Moderate": "bg-yellow-100 text-yellow-800", 
  "High": "bg-orange-100 text-orange-800",
  "Severe": "bg-red-100 text-red-800",
  "Critical": "bg-purple-100 text-purple-800"
};

const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function ChokepointDashboard({ selectedArea, onChokepointSelect }: ChokepointDashboardProps) {
  const [chokepoints, setChokepoints] = useState<Chokepoint[]>([]);
  const [summary, setSummary] = useState<ChokepointSummary | null>(null);
  const [selectedChokepoint, setSelectedChokepoint] = useState<Chokepoint | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Historical analysis removed
  }, [selectedArea]);

  const fetchChokepoints = async () => {};

  const fetchSummary = async () => {};



  const startAnalysis = async () => {};

  const pollAnalysisStatus = async (_jobId: number) => {};

  const getSeverityBadge = (score: number) => {
    let severity = "Low";
    if (score >= 80) severity = "Critical";
    else if (score >= 60) severity = "Severe";
    else if (score >= 40) severity = "High";
    else if (score >= 20) severity = "Moderate";

    return (
      <Badge className={severityColors[severity as keyof typeof severityColors]}>
        {severity}
      </Badge>
    );
  };

  const formatTime = (hour: number) => `${hour.toString().padStart(2, '0')}:00`;

  const handleChokepointClick = (chokepoint: Chokepoint) => {
    setSelectedChokepoint(chokepoint);
    onChokepointSelect?.(chokepoint);
  };

  if (!selectedArea) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        Select an area on the map to view choke point analysis
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Traffic Choke Points</h2>
          <p className="text-muted-foreground">
            {selectedArea.name || "Selected Area"} • {chokepoints.length} choke points identified
          </p>
        </div>
        {/* Historical analysis removed */}
      </div>

      {error && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-orange-700">
              <AlertTriangle className="h-4 w-4" />
              <p className="text-sm">
                {error} No chokepoint data available.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <MapPin className="h-4 w-4 text-blue-500" />
                Total Choke Points
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">
                {summary.total_chokepoints}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <TrendingUp className="h-4 w-4 text-orange-500" />
                Average Score
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">
                {summary.average_congestion_score.toFixed(1)}
              </div>
              <div className="text-xs text-muted-foreground">out of 100</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                Critical Points
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {summary.severity_distribution.Critical?.count || 0}
              </div>
              <div className="text-xs text-muted-foreground">
                {summary.severity_distribution.Critical?.percentage.toFixed(1) || 0}% of total
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-green-500" />
                Last Analysis
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-sm font-medium">
                {summary.last_analysis 
                  ? new Date(summary.last_analysis).toLocaleDateString()
                  : 'Never'
                }
              </div>
              <div className="text-xs text-muted-foreground">
                {summary.last_analysis 
                  ? new Date(summary.last_analysis).toLocaleTimeString()
                  : 'Run analysis'
                }
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Live Leaderboard */}
      <LiveLeaderboard selectedArea={selectedArea} />

      {/* Historical list removed */}

      {/* Detail Modal */}
      {selectedChokepoint && (
        <ChokepointDetailModal
          chokepoint={selectedChokepoint}
          isOpen={!!selectedChokepoint}
          onClose={() => setSelectedChokepoint(null)}
        />
      )}
    </div>
  );
}