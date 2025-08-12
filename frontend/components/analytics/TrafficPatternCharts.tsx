"use client";

import { useState, useEffect } from "react";
import { DateRange } from "react-day-picker";
import { format } from "date-fns";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from "recharts";
import { AlertTriangle, Clock, Calendar, TrendingUp } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface TrafficPatternChartsProps {
  dateRange: DateRange;
  selectedArea?: {
    bbox: [number, number, number, number];
    name?: string;
  };
  onLoadingChange: (loading: boolean) => void;
}

interface HourlyPattern {
  hour: number;
  avg_speed_kmh: number;
  avg_delay_minutes: number;
  observations: number;
}

interface DailyPattern {
  day_of_week: number;
  avg_speed_kmh: number;
  avg_delay_minutes: number;
  observations: number;
}

interface CongestionDistribution {
  level: number;
  count: number;
  percentage: number;
}

const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const hourLabels = Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, '0')}:00`);

const congestionColors = ["#22c55e", "#eab308", "#f97316", "#ef4444", "#a855f7"];
const congestionLabels = ["Free Flow", "Light", "Moderate", "Heavy", "Severe"];

export function TrafficPatternCharts({
  dateRange,
  selectedArea,
  onLoadingChange
}: TrafficPatternChartsProps) {
  const [hourlyPatterns, setHourlyPatterns] = useState<HourlyPattern[]>([]);
  const [dailyPatterns, setDailyPatterns] = useState<DailyPattern[]>([]);
  const [congestionDistribution, setCongestionDistribution] = useState<CongestionDistribution[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (dateRange.from && dateRange.to && selectedArea) {
      fetchTrafficPatterns();
    }
  }, [dateRange, selectedArea]);

  const fetchTrafficPatterns = async () => {
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
      setHourlyPatterns(data.hourly_patterns || []);
      setDailyPatterns(data.daily_patterns || []);
      setCongestionDistribution(data.congestion_distribution || []);
    } catch (err) {
      console.error('Error fetching traffic patterns:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch traffic patterns');
      
      // For demo purposes, use mock data
      generateMockData();
    } finally {
      onLoadingChange(false);
    }
  };

  const generateMockData = () => {
    // Generate mock hourly patterns
    const mockHourlyPatterns: HourlyPattern[] = Array.from({ length: 24 }, (_, hour) => {
      let baseSpeed = 50;
      let baseDelay = 2;
      
      // Rush hour patterns
      if (hour >= 7 && hour <= 10) { // Morning rush
        baseSpeed = 25 + (hour - 7) * 5;
        baseDelay = 8 - (hour - 7) * 1.5;
      } else if (hour >= 17 && hour <= 20) { // Evening rush
        baseSpeed = 30 - (hour - 17) * 3;
        baseDelay = 6 + (hour - 17) * 1;
      } else if (hour >= 22 || hour <= 5) { // Night hours
        baseSpeed = 65;
        baseDelay = 1;
      }

      return {
        hour,
        avg_speed_kmh: baseSpeed + Math.random() * 10 - 5,
        avg_delay_minutes: Math.max(0.5, baseDelay + Math.random() * 2 - 1),
        observations: 400 + Math.floor(Math.random() * 200)
      };
    });

    // Generate mock daily patterns
    const mockDailyPatterns: DailyPattern[] = Array.from({ length: 7 }, (_, day) => {
      const isWeekend = day >= 5;
      const baseSpeed = isWeekend ? 55 : 42;
      const baseDelay = isWeekend ? 2 : 4;

      return {
        day_of_week: day,
        avg_speed_kmh: baseSpeed + Math.random() * 8 - 4,
        avg_delay_minutes: baseDelay + Math.random() * 1.5 - 0.75,
        observations: isWeekend ? 800 : 1200 + Math.floor(Math.random() * 400)
      };
    });

    // Generate mock congestion distribution
    const mockCongestionDistribution: CongestionDistribution[] = [
      { level: 0, count: 6168, percentage: 40.0 },
      { level: 1, count: 4626, percentage: 30.0 },
      { level: 2, count: 3084, percentage: 20.0 },
      { level: 3, count: 1234, percentage: 8.0 },
      { level: 4, count: 308, percentage: 2.0 }
    ];

    setHourlyPatterns(mockHourlyPatterns);
    setDailyPatterns(mockDailyPatterns);
    setCongestionDistribution(mockCongestionDistribution);
  };

  const formatTooltip = (value: number, name: string) => {
    if (name.includes('speed')) {
      return [`${value.toFixed(1)} km/h`, name];
    }
    if (name.includes('delay')) {
      return [`${value.toFixed(1)} min`, name];
    }
    return [value, name];
  };

  const CustomTooltip = ({ active, payload, label }: {
    active?: boolean;
    payload?: Array<{ color: string; name: string; value: number; dataKey: string }>;
    label?: string;
  }) => {
    if (!active || !payload || !payload.length) return null;

    return (
      <div className="bg-background border rounded-lg p-3 shadow-lg">
        <p className="font-medium">{label}</p>
        {payload.map((entry, index: number) => (
          <p key={index} style={{ color: entry.color }} className="text-sm">
            {entry.name}: {formatTooltip(entry.value, entry.dataKey)[0]}
          </p>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {error && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-orange-700">
              <AlertTriangle className="h-4 w-4" />
              <p className="text-sm">
                Unable to fetch live data. Showing sample patterns for demonstration.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

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
          <TabsTrigger value="distribution" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Distribution
          </TabsTrigger>
        </TabsList>

        <TabsContent value="hourly" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Hourly Traffic Patterns</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={hourlyPatterns}>
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
              <div className="mt-4 text-sm text-muted-foreground">
                Traffic patterns show typical rush hour congestion peaks during morning (7-10 AM) and evening (5-8 PM) periods.
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="daily" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Daily Traffic Patterns</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyPatterns}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis 
                      dataKey="day_of_week"
                      tickFormatter={(day) => dayNames[day]}
                      className="text-xs"
                    />
                    <YAxis yAxisId="speed" orientation="left" className="text-xs" />
                    <YAxis yAxisId="delay" orientation="right" className="text-xs" />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Bar
                      yAxisId="speed"
                      dataKey="avg_speed_kmh"
                      fill="#3b82f6"
                      name="Average Speed (km/h)"
                      radius={[2, 2, 0, 0]}
                    />
                    <Bar
                      yAxisId="delay"
                      dataKey="avg_delay_minutes"
                      fill="#f97316"
                      name="Average Delay (min)"
                      radius={[2, 2, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 text-sm text-muted-foreground">
                Weekend traffic typically shows higher speeds and lower delays compared to weekdays due to reduced commuter traffic.
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="distribution" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Congestion Level Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={congestionDistribution.map((item, index) => ({
                        ...item,
                        name: congestionLabels[item.level],
                        fill: congestionColors[item.level]
                      }))}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percentage }) => `${name}: ${percentage.toFixed(1)}%`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="count"
                    >
                      {congestionDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={congestionColors[entry.level]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value: number, name: string) => [
                        value.toLocaleString(), 
                        'Observations'
                      ]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 space-y-2">
                {congestionDistribution.map((item, index) => (
                  <div key={item.level} className="flex items-center gap-3 text-sm">
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: congestionColors[item.level] }}
                    />
                    <span className="font-medium">{congestionLabels[item.level]}</span>
                    <span className="text-muted-foreground">
                      {item.count.toLocaleString()} observations ({item.percentage.toFixed(1)}%)
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}