"use client";

import { useState, useEffect } from "react";
import { DateRange } from "react-day-picker";
import { format } from "date-fns";
import {
  Car,
  Clock,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  BarChart3,
  MapPin,
  Timer
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";

interface TrafficStatsOverviewProps {
  dateRange: DateRange;
  selectedArea?: {
    bbox: [number, number, number, number];
    name?: string;
  };
  onLoadingChange: (loading: boolean) => void;
}

interface TrafficStats {
  overall: {
    avg_speed_kmh: number;
    avg_delay_minutes: number;
    avg_relative_speed: number;
    total_observations: number;
  };
  congestion_distribution: Array<{
    level: number;
    count: number;
    percentage: number;
  }>;
  top_congested_roads: Array<{
    road_name: string;
    avg_delay_minutes: number;
    max_delay_minutes: number;
    observations: number;
  }>;
  date_range: {
    start: string;
    end: string;
  };
  bbox: number[];
}

const congestionLevels = [
  { level: 0, label: "Free Flow", color: "bg-green-500", description: "Minimal congestion" },
  { level: 1, label: "Light", color: "bg-yellow-500", description: "Light traffic" },
  { level: 2, label: "Moderate", color: "bg-orange-500", description: "Moderate congestion" },
  { level: 3, label: "Heavy", color: "bg-red-500", description: "Heavy traffic" },
  { level: 4, label: "Severe", color: "bg-purple-500", description: "Severe congestion" }
];

export function TrafficStatsOverview({
  dateRange,
  selectedArea,
  onLoadingChange
}: TrafficStatsOverviewProps) {
  const [stats, setStats] = useState<TrafficStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (dateRange.from && dateRange.to && selectedArea) {
      fetchTrafficStats();
    }
  }, [dateRange, selectedArea]);

  const fetchTrafficStats = async () => {
    if (!dateRange.from || !dateRange.to || !selectedArea) return;

    onLoadingChange(true);
    setError(null);

    try {
      const startDate = format(dateRange.from, 'yyyy-MM-dd');
      const endDate = format(dateRange.to, 'yyyy-MM-dd');
      const bbox = selectedArea.bbox.join(',');

      const response = await fetch(
        `/api/traffic-stats?start_date=${startDate}&end_date=${endDate}&bbox=${bbox}`
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      setStats(data);
    } catch (err) {
      console.error('Error fetching traffic stats:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch traffic statistics');
      
      // For demo purposes, use mock data
      setStats({
        overall: {
          avg_speed_kmh: 42.5,
          avg_delay_minutes: 3.2,
          avg_relative_speed: 0.75,
          total_observations: 15420
        },
        congestion_distribution: [
          { level: 0, count: 6168, percentage: 40.0 },
          { level: 1, count: 4626, percentage: 30.0 },
          { level: 2, count: 3084, percentage: 20.0 },
          { level: 3, count: 1234, percentage: 8.0 },
          { level: 4, count: 308, percentage: 2.0 }
        ],
        top_congested_roads: [
          { road_name: "Outer Ring Road", avg_delay_minutes: 8.5, max_delay_minutes: 25.3, observations: 1200 },
          { road_name: "Hosur Road", avg_delay_minutes: 7.2, max_delay_minutes: 22.1, observations: 980 },
          { road_name: "Electronic City", avg_delay_minutes: 6.8, max_delay_minutes: 19.5, observations: 845 },
          { road_name: "Airport Road", avg_delay_minutes: 5.9, max_delay_minutes: 18.2, observations: 756 },
          { road_name: "Whitefield Road", avg_delay_minutes: 5.1, max_delay_minutes: 16.8, observations: 623 }
        ],
        date_range: {
          start: format(dateRange.from!, 'yyyy-MM-dd'),
          end: format(dateRange.to!, 'yyyy-MM-dd')
        },
        bbox: selectedArea.bbox
      });
    } finally {
      onLoadingChange(false);
    }
  };

  if (!stats) {
    return (
      <div className="space-y-4">
        <div className="text-center text-muted-foreground">
          Select an area on the map to view traffic analytics
        </div>
      </div>
    );
  }

  const formatSpeed = (speed: number) => `${speed.toFixed(1)} km/h`;
  const formatDelay = (delay: number) => `${delay.toFixed(1)} min`;
  const formatPercentage = (value: number) => `${(value * 100).toFixed(0)}%`;

  return (
    <div className="space-y-6">
      {error && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-orange-700">
              <AlertTriangle className="h-4 w-4" />
              <p className="text-sm">
                Unable to fetch live data. Showing sample data for demonstration.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Car className="h-4 w-4 text-blue-500" />
              Average Speed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {formatSpeed(stats.overall.avg_speed_kmh)}
            </div>
            <div className="flex items-center gap-1 mt-1">
              <span className="text-sm text-muted-foreground">
                Efficiency: {formatPercentage(stats.overall.avg_relative_speed)}
              </span>
              {stats.overall.avg_relative_speed > 0.7 ? (
                <TrendingUp className="h-3 w-3 text-green-500" />
              ) : (
                <TrendingDown className="h-3 w-3 text-red-500" />
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-orange-500" />
              Average Delay
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {formatDelay(stats.overall.avg_delay_minutes)}
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              Per kilometer traveled
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <BarChart3 className="h-4 w-4 text-purple-500" />
              Total Observations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {stats.overall.total_observations.toLocaleString()}
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              Data points analyzed
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Timer className="h-4 w-4 text-green-500" />
              Traffic Quality
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {stats.overall.avg_relative_speed > 0.8 ? 'Good' : 
               stats.overall.avg_relative_speed > 0.6 ? 'Fair' : 'Poor'}
            </div>
            <Progress 
              value={stats.overall.avg_relative_speed * 100} 
              className="mt-2"
            />
          </CardContent>
        </Card>
      </div>

      {/* Congestion Distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Congestion Distribution
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {congestionLevels.map((level) => {
              const stat = stats.congestion_distribution.find(s => s.level === level.level);
              const percentage = stat ? stat.percentage : 0;
              const count = stat ? stat.count : 0;

              return (
                <div key={level.level} className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${level.color}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">{level.label}</span>
                      <span className="text-sm text-muted-foreground">
                        {percentage.toFixed(1)}%
                      </span>
                    </div>
                    <Progress value={percentage} className="h-2" />
                    <div className="text-xs text-muted-foreground mt-1">
                      {count.toLocaleString()} observations • {level.description}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Top Congested Roads */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Most Congested Roads
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {stats.top_congested_roads.map((road, index) => (
              <div key={road.road_name} className="flex items-center gap-3">
                <Badge variant="outline" className="w-6 h-6 p-0 flex items-center justify-center text-xs">
                  {index + 1}
                </Badge>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium truncate">{road.road_name}</h4>
                    <span className="text-sm text-muted-foreground">
                      {formatDelay(road.avg_delay_minutes)} avg
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-muted-foreground">
                      Max delay: {formatDelay(road.max_delay_minutes)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {road.observations.toLocaleString()} observations
                    </span>
                  </div>
                  <Progress 
                    value={(road.avg_delay_minutes / Math.max(...stats.top_congested_roads.map(r => r.avg_delay_minutes))) * 100}
                    className="h-1 mt-2"
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <Card className="bg-muted/30">
        <CardContent className="pt-4">
          <div className="text-sm text-muted-foreground">
            <p>
              Analysis covers <strong>{stats.overall.total_observations.toLocaleString()}</strong> traffic 
              observations from <strong>{format(dateRange.from!, 'MMM d')}</strong> to{' '}
              <strong>{format(dateRange.to!, 'MMM d, yyyy')}</strong>.
            </p>
            {selectedArea?.name && (
              <p className="mt-1">
                Area: <strong>{selectedArea.name}</strong>
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}