"use client";

import { useState, useEffect } from "react";
import { X, MapPin, Clock, TrendingUp, AlertTriangle, BarChart3, Calendar } from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from "recharts";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Chokepoint {
  id: number;
  location: { lat: number; lon: number };
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

interface ChokepointDetailModalProps {
  chokepoint: Chokepoint;
  isOpen: boolean;
  onClose: () => void;
}

interface ChokepointDetails {
  choke_point: Chokepoint;
  historical_data: Array<{
    date: string;
    hour: number;
    avg_speed_kmh: number;
    avg_delay_minutes: number;
    avg_relative_speed: number;
    observations: number;
  }>;
  hourly_patterns: Array<{
    hour: number;
    avg_speed_kmh: number;
    avg_delay_minutes: number;
    max_delay_minutes: number;
    observations: number;
  }>;
  daily_patterns: Array<{
    day_of_week: number;
    avg_speed_kmh: number;
    avg_delay_minutes: number;
    max_delay_minutes: number;
    observations: number;
  }>;
  analysis_period: {
    start_date: string;
    end_date: string;
    days: number;
  };
}

const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const hourLabels = Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, '0')}:00`);

export function ChokepointDetailModal({ chokepoint, isOpen, onClose }: ChokepointDetailModalProps) {
  const [details, setDetails] = useState<ChokepointDetails | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && chokepoint) {
      fetchDetails();
    }
  }, [isOpen, chokepoint]);

  const fetchDetails = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/chokepoint-details/${chokepoint.id}?days_back=30`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      setDetails(data);
    } catch (err) {
      console.error('Error fetching chokepoint details:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch details');
      
      // Generate mock detailed data
      generateMockDetails();
    } finally {
      setIsLoading(false);
    }
  };

  const generateMockDetails = () => {
    // Generate mock hourly patterns
    const mockHourlyPatterns = Array.from({ length: 24 }, (_, hour) => {
      let baseSpeed = 50;
      let baseDelay = 3;
      
      // Create congestion patterns based on the choke point's worst hour
      const distanceFromWorstHour = Math.abs(hour - chokepoint.worst_hour);
      const congestionFactor = Math.max(0.3, 1 - (distanceFromWorstHour / 12));
      
      baseSpeed = 60 * congestionFactor;
      baseDelay = 10 * (1 - congestionFactor);

      return {
        hour,
        avg_speed_kmh: baseSpeed + Math.random() * 10 - 5,
        avg_delay_minutes: Math.max(0.5, baseDelay + Math.random() * 3 - 1.5),
        max_delay_minutes: baseDelay * 1.8 + Math.random() * 5,
        observations: 80 + Math.floor(Math.random() * 40)
      };
    });

    // Generate mock daily patterns
    const mockDailyPatterns = Array.from({ length: 7 }, (_, day) => {
      const isWorstDay = day === chokepoint.worst_day;
      const isWeekend = day >= 5;
      
      let baseSpeed = isWeekend ? 55 : 42;
      let baseDelay = isWeekend ? 2 : 5;
      
      if (isWorstDay) {
        baseSpeed *= 0.7;
        baseDelay *= 1.5;
      }

      return {
        day_of_week: day,
        avg_speed_kmh: baseSpeed + Math.random() * 8 - 4,
        avg_delay_minutes: baseDelay + Math.random() * 2 - 1,
        max_delay_minutes: baseDelay * 2 + Math.random() * 5,
        observations: isWeekend ? 400 : 600 + Math.floor(Math.random() * 200)
      };
    });

    // Generate mock historical data (last 30 days)
    const mockHistoricalData = [];
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      
      for (let hour = 0; hour < 24; hour += 4) { // Every 4 hours
        const pattern = mockHourlyPatterns[hour];
        const dayPattern = mockDailyPatterns[date.getDay()];
        
        mockHistoricalData.push({
          date: date.toISOString().split('T')[0],
          hour,
          avg_speed_kmh: (pattern.avg_speed_kmh + dayPattern.avg_speed_kmh) / 2,
          avg_delay_minutes: (pattern.avg_delay_minutes + dayPattern.avg_delay_minutes) / 2,
          avg_relative_speed: Math.min(1, pattern.avg_speed_kmh / 60),
          observations: Math.floor((pattern.observations + dayPattern.observations) / 2)
        });
      }
    }

    setDetails({
      choke_point: chokepoint,
      historical_data: mockHistoricalData,
      hourly_patterns: mockHourlyPatterns,
      daily_patterns: mockDailyPatterns,
      analysis_period: {
        start_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        end_date: new Date().toISOString().split('T')[0],
        days: 30
      }
    });
  };

  const getSeverityColor = (score: number) => {
    if (score >= 80) return "text-purple-600 bg-purple-100";
    if (score >= 60) return "text-red-600 bg-red-100";
    if (score >= 40) return "text-orange-600 bg-orange-100";
    if (score >= 20) return "text-yellow-600 bg-yellow-100";
    return "text-green-600 bg-green-100";
  };

  const formatTime = (hour: number) => `${hour.toString().padStart(2, '0')}:00`;

  const CustomTooltip = ({ active, payload, label }: {
    active?: boolean;
    payload?: Array<{ color: string; name: string; value: number }>;
    label?: string;
  }) => {
    if (!active || !payload || !payload.length) return null;

    return (
      <div className="bg-background border rounded-lg p-3 shadow-lg">
        <p className="font-medium">{label}</p>
        {payload.map((entry, index: number) => (
          <p key={index} style={{ color: entry.color }} className="text-sm">
            {entry.name}: {entry.name.includes('speed') ? `${entry.value.toFixed(1)} km/h` : 
                         entry.name.includes('delay') ? `${entry.value.toFixed(1)} min` : 
                         entry.value.toFixed(1)}
          </p>
        ))}
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            {chokepoint.road_name} - Choke Point Analysis
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-8rem)]">
          <div className="space-y-6">
            {error && (
              <Card className="border-orange-200 bg-orange-50">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 text-orange-700">
                    <AlertTriangle className="h-4 w-4" />
                    <p className="text-sm">
                      Unable to fetch live data. Showing sample analysis for demonstration.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Congestion Score</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold px-2 py-1 rounded ${getSeverityColor(chokepoint.congestion_score)}`}>
                    {chokepoint.congestion_score.toFixed(1)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Rank #{chokepoint.rank}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Average Delay</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-orange-600">
                    {chokepoint.avg_delay_minutes.toFixed(1)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    minutes
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Peak Congestion</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-lg font-bold text-red-600">
                    {dayNames[chokepoint.worst_day]}
                  </div>
                  <div className="text-sm font-medium">
                    {formatTime(chokepoint.worst_hour)}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Data Quality</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-blue-600">
                    {(chokepoint.data_quality_score * 100).toFixed(0)}%
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {chokepoint.total_observations.toLocaleString()} obs
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Score Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle>Score Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Frequency</span>
                      <span className="text-sm">{(chokepoint.frequency_score * 100).toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-blue-600 h-2 rounded-full" 
                        style={{ width: `${chokepoint.frequency_score * 100}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">How often congested</p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Intensity</span>
                      <span className="text-sm">{(chokepoint.intensity_score * 100).toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-orange-600 h-2 rounded-full" 
                        style={{ width: `${chokepoint.intensity_score * 100}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">How severe when congested</p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Duration</span>
                      <span className="text-sm">{(chokepoint.duration_score * 100).toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-red-600 h-2 rounded-full" 
                        style={{ width: `${chokepoint.duration_score * 100}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">How long congestion lasts</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Peak Periods */}
            {chokepoint.peak_periods && chokepoint.peak_periods.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Peak Congestion Periods</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {chokepoint.peak_periods.map((period, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <div>
                          <div className="font-medium">
                            {period.start} - {period.end}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Severity: {(period.severity * 100).toFixed(0)}%
                          </div>
                        </div>
                        <Badge 
                          className={period.severity > 0.7 ? 'bg-red-100 text-red-800' : 'bg-orange-100 text-orange-800'}
                        >
                          {period.severity > 0.7 ? 'High' : 'Moderate'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Charts */}
            {details && !isLoading && (
              <Tabs defaultValue="hourly" className="space-y-4">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="hourly" className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Hourly
                  </TabsTrigger>
                  <TabsTrigger value="daily" className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Daily
                  </TabsTrigger>
                  <TabsTrigger value="trend" className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Trends
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="hourly">
                  <Card>
                    <CardHeader>
                      <CardTitle>Hourly Traffic Patterns</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={details.hourly_patterns}>
                            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                            <XAxis 
                              dataKey="hour"
                              tickFormatter={(hour) => hourLabels[hour]}
                              className="text-xs"
                            />
                            <YAxis yAxisId="speed" orientation="left" className="text-xs" />
                            <YAxis yAxisId="delay" orientation="right" className="text-xs" />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend />
                            <Line
                              yAxisId="speed"
                              type="monotone"
                              dataKey="avg_speed_kmh"
                              stroke="#3b82f6"
                              strokeWidth={2}
                              dot={{ fill: "#3b82f6", strokeWidth: 2, r: 3 }}
                              name="Average Speed (km/h)"
                            />
                            <Line
                              yAxisId="delay"
                              type="monotone"
                              dataKey="avg_delay_minutes"
                              stroke="#f97316"
                              strokeWidth={2}
                              dot={{ fill: "#f97316", strokeWidth: 2, r: 3 }}
                              name="Average Delay (min)"
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="daily">
                  <Card>
                    <CardHeader>
                      <CardTitle>Daily Traffic Patterns</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={details.daily_patterns}>
                            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                            <XAxis 
                              dataKey="day_of_week"
                              tickFormatter={(day) => dayNames[day]}
                              className="text-xs"
                            />
                            <YAxis className="text-xs" />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend />
                            <Bar
                              dataKey="avg_delay_minutes"
                              fill="#f97316"
                              name="Average Delay (min)"
                              radius={[2, 2, 0, 0]}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="trend">
                  <Card>
                    <CardHeader>
                      <CardTitle>30-Day Trend Analysis</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={details.historical_data}>
                            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                            <XAxis 
                              dataKey="date"
                              className="text-xs"
                              tick={{ fontSize: 10 }}
                            />
                            <YAxis className="text-xs" />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend />
                            <Line
                              type="monotone"
                              dataKey="avg_delay_minutes"
                              stroke="#f97316"
                              strokeWidth={1}
                              dot={false}
                              name="Delay (min)"
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            )}

            {isLoading && (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <span className="ml-2">Loading detailed analysis...</span>
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}