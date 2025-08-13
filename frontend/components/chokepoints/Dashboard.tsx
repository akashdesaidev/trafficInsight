"use client";

import { useState, useEffect } from "react";
import { MapPin, TrendingUp, Clock, AlertTriangle, RefreshCw, Play } from "lucide-react";

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
    if (selectedArea) {
      fetchChokepoints();
      fetchSummary();
    }
  }, [selectedArea]);

  const fetchChokepoints = async () => {
    if (!selectedArea) return;

    setIsLoading(true);
    setError(null);

    try {
      const bbox = selectedArea.bbox.join(',');
      const response = await fetch(`/api/top-chokepoints?limit=20&bbox=${bbox}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      setChokepoints(data.choke_points || []);
    } catch (err) {
      console.error('Error fetching chokepoints:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch choke points');
      
      // For demo purposes, use mock data
      generateMockChokepoints();
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSummary = async () => {
    if (!selectedArea) return;

    try {
      const bbox = selectedArea.bbox.join(',');
      const response = await fetch(`/api/chokepoint-summary?bbox=${bbox}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      setSummary(data);
    } catch (err) {
      console.error('Error fetching summary:', err);
      
      // Mock summary data
      setSummary({
        total_chokepoints: 15,
        average_congestion_score: 65.2,
        severity_distribution: {
          "Low": { count: 2, percentage: 13.3 },
          "Moderate": { count: 3, percentage: 20.0 },
          "High": { count: 5, percentage: 33.3 },
          "Severe": { count: 4, percentage: 26.7 },
          "Critical": { count: 1, percentage: 6.7 }
        },
        top_roads: [
          { road_name: "Outer Ring Road", avg_congestion_score: 85.2, chokepoint_count: 3 },
          { road_name: "Hosur Road", avg_congestion_score: 78.4, chokepoint_count: 2 },
          { road_name: "Electronic City", avg_congestion_score: 72.1, chokepoint_count: 2 }
        ],
        last_analysis: "2024-12-26T14:30:00Z",
        bbox: selectedArea.bbox.join(',')
      });
    }
  };

  const generateMockChokepoints = () => {
    if (!selectedArea) return;

    const [minLon, minLat, maxLon, maxLat] = selectedArea.bbox;
    const roadNames = [
      "Outer Ring Road", "Hosur Road", "Airport Road", "Bannerghatta Road",
      "Whitefield Road", "Electronic City", "Koramangala Main Road",
      "Indiranagar 100 Feet Road", "MG Road", "Brigade Road"
    ];

    const mockData: Chokepoint[] = Array.from({ length: 15 }, (_, i) => {
      const lat = minLat + Math.random() * (maxLat - minLat);
      const lon = minLon + Math.random() * (maxLon - minLon);
      const roadName = roadNames[i % roadNames.length];
      const score = 30 + Math.random() * 60; // 30-90 range
      
      return {
        id: i + 1,
        location: { lat, lon },
        road_name: roadName,
        segment_id: `seg_${i + 1}_${lat.toFixed(4)}_${lon.toFixed(4)}`,
        congestion_score: parseFloat(score.toFixed(1)),
        rank: i + 1,
        avg_delay_minutes: 3 + Math.random() * 12,
        max_delay_minutes: 15 + Math.random() * 20,
        frequency_score: 0.2 + Math.random() * 0.6,
        intensity_score: 0.3 + Math.random() * 0.5,
        duration_score: 0.1 + Math.random() * 0.4,
        peak_periods: [
          { start: "08:00", end: "10:00", severity: 0.7 + Math.random() * 0.3 },
          { start: "18:00", end: "20:00", severity: 0.6 + Math.random() * 0.4 }
        ],
        worst_hour: 8 + Math.floor(Math.random() * 2),
        worst_day: Math.floor(Math.random() * 5), // Weekdays mostly
        last_updated: "2024-12-26T14:30:00Z",
        total_observations: 500 + Math.floor(Math.random() * 1000),
        data_quality_score: 0.7 + Math.random() * 0.3
      };
    });

    // Sort by congestion score
    mockData.sort((a, b) => b.congestion_score - a.congestion_score);
    setChokepoints(mockData);
  };

  const startAnalysis = async () => {
    if (!selectedArea) return;

    setIsAnalyzing(true);
    try {
      const bbox = selectedArea.bbox.join(',');
      const response = await fetch(
        `/api/analyze-chokepoints?bbox=${bbox}&days_back=30&force_refresh=true`,
        { method: 'POST' }
      );
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Poll for completion
      await pollAnalysisStatus(data.job_id);
    } catch (err) {
      console.error('Error starting analysis:', err);
      setError(err instanceof Error ? err.message : 'Failed to start analysis');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const pollAnalysisStatus = async (jobId: number) => {
    const maxAttempts = 30; // 5 minutes max
    let attempts = 0;

    const poll = async () => {
      try {
        const response = await fetch(`/api/chokepoint-analysis-status/${jobId}`);
        const status = await response.json();

        if (status.status === 'completed') {
          await fetchChokepoints();
          await fetchSummary();
          return;
        }

        if (status.status === 'failed') {
          throw new Error(status.error_message || 'Analysis failed');
        }

        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(poll, 10000); // Poll every 10 seconds
        }
      } catch (err) {
        console.error('Error polling analysis status:', err);
      }
    };

    poll();
  };

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
        <Button
          onClick={startAnalysis}
          disabled={isAnalyzing}
          className="flex items-center gap-2"
        >
          {isAnalyzing ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <Play className="h-4 w-4" />
              Run Analysis
            </>
          )}
        </Button>
      </div>

      {error && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-orange-700">
              <AlertTriangle className="h-4 w-4" />
              <p className="text-sm">
                {error} Showing sample data for demonstration.
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

      {/* Historical/Analysis Choke Points List */}
      <Card>
        <CardHeader>
          <CardTitle>Ranked Choke Points (Historical/Analysis)</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin" />
              <span className="ml-2">Loading choke points...</span>
            </div>
          ) : (
            <ScrollArea className="h-[400px]">
              <div className="space-y-3">
                {chokepoints.map((chokepoint) => (
                  <div
                    key={chokepoint.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => handleChokepointClick(chokepoint)}
                  >
                    <div className="flex items-center gap-4">
                      <Badge variant="outline" className="w-8 h-8 rounded-full flex items-center justify-center">
                        {chokepoint.rank}
                      </Badge>
                      
                      <div className="min-w-0 flex-1">
                        <h4 className="font-medium truncate">{chokepoint.road_name}</h4>
                        <p className="text-sm text-muted-foreground">
                          Avg delay: {chokepoint.avg_delay_minutes.toFixed(1)}min • 
                          Peak: {dayNames[chokepoint.worst_day]} {formatTime(chokepoint.worst_hour)}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-muted-foreground">
                            {chokepoint.total_observations.toLocaleString()} observations
                          </span>
                          <span className="text-xs text-muted-foreground">•</span>
                          <span className="text-xs text-muted-foreground">
                            {(chokepoint.frequency_score * 100).toFixed(0)}% congested
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="font-semibold">
                          {chokepoint.congestion_score.toFixed(1)}
                        </div>
                        <div className="text-xs text-muted-foreground">score</div>
                      </div>
                      {getSeverityBadge(chokepoint.congestion_score)}
                    </div>
                  </div>
                ))}

                {chokepoints.length === 0 && !isLoading && (
                  <div className="text-center py-8 text-muted-foreground">
                    No choke points found in the selected area.
                    Try running the analysis or selecting a different area.
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

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