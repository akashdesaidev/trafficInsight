"use client";

import { useState, useEffect, useRef } from "react";
import { DateRange } from "react-day-picker";
import { format } from "date-fns";
import { Play, Pause, SkipBack, SkipForward, Settings, Download, AlertTriangle } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CongestionHeatmapProps {
  dateRange: DateRange;
  selectedArea?: {
    bbox: [number, number, number, number];
    name?: string;
  };
  onLoadingChange: (loading: boolean) => void;
}

interface HeatmapData {
  timestamp: string;
  hour: number;
  data: Array<{
    lat: number;
    lon: number;
    intensity: number; // 0-1 congestion intensity
    speed_kmh: number;
    delay_minutes: number;
  }>;
}

export function CongestionHeatmap({
  dateRange,
  selectedArea,
  onLoadingChange
}: CongestionHeatmapProps) {
  const [heatmapData, setHeatmapData] = useState<HeatmapData[]>([]);
  const [currentHour, setCurrentHour] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(1000); // milliseconds
  const [opacity, setOpacity] = useState([0.7]);
  const [showLegend, setShowLegend] = useState(true);
  const [heatmapType, setHeatmapType] = useState<'intensity' | 'speed' | 'delay'>('intensity');
  const [error, setError] = useState<string | null>(null);
  
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (dateRange.from && dateRange.to && selectedArea) {
      fetchHeatmapData();
    }
  }, [dateRange, selectedArea]);

  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        setCurrentHour(prev => (prev + 1) % 24);
      }, playSpeed);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isPlaying, playSpeed]);

  useEffect(() => {
    drawHeatmap();
  }, [currentHour, heatmapData, heatmapType, opacity]);

  const fetchHeatmapData = async () => {
    if (!dateRange.from || !dateRange.to || !selectedArea) return;

    onLoadingChange(true);
    setError(null);

    try {
      const startDate = format(dateRange.from, 'yyyy-MM-dd');
      const endDate = format(dateRange.to, 'yyyy-MM-dd');
      const bbox = selectedArea.bbox.join(',');

      const response = await fetch(
        `/api/historical-traffic?start_date=${startDate}&end_date=${endDate}&bbox=${bbox}&granularity=hourly&limit=5000`
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      processHeatmapData(data.data || []);
    } catch (err) {
      console.error('Error fetching heatmap data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch heatmap data');
      
      // For demo purposes, generate mock data
      generateMockHeatmapData();
    } finally {
      onLoadingChange(false);
    }
  };

  const processHeatmapData = (rawData: Array<{
    hour: number;
    location: { lat: number; lon: number };
    delay_minutes: number;
    speed_kmh: number;
  }>) => {
    // Group data by hour
    const hourlyData: { [hour: number]: HeatmapData } = {};

    for (let hour = 0; hour < 24; hour++) {
      hourlyData[hour] = {
        timestamp: `${hour.toString().padStart(2, '0')}:00`,
        hour,
        data: []
      };
    }

    rawData.forEach(item => {
      const hour = item.hour;
      if (hourlyData[hour]) {
        hourlyData[hour].data.push({
          lat: item.location.lat,
          lon: item.location.lon,
          intensity: Math.min(1, item.delay_minutes / 10), // Normalize to 0-1
          speed_kmh: item.speed_kmh,
          delay_minutes: item.delay_minutes
        });
      }
    });

    setHeatmapData(Object.values(hourlyData));
  };

  const generateMockHeatmapData = () => {
    if (!selectedArea) return;

    const [minLon, minLat, maxLon, maxLat] = selectedArea.bbox;
    const mockData: HeatmapData[] = [];

    for (let hour = 0; hour < 24; hour++) {
      const data = [];
      const numPoints = 50 + Math.floor(Math.random() * 50);

      for (let i = 0; i < numPoints; i++) {
        const lat = minLat + Math.random() * (maxLat - minLat);
        const lon = minLon + Math.random() * (maxLon - minLon);

        // Create traffic patterns (rush hours have higher congestion)
        let baseIntensity = 0.3;
        if (hour >= 7 && hour <= 10) baseIntensity = 0.8; // Morning rush
        if (hour >= 17 && hour <= 20) baseIntensity = 0.7; // Evening rush
        if (hour >= 22 || hour <= 5) baseIntensity = 0.1; // Night

        const intensity = Math.min(1, baseIntensity + Math.random() * 0.3 - 0.15);
        const speed = 60 * (1 - intensity) + Math.random() * 15;
        const delay = intensity * 8 + Math.random() * 2;

        data.push({
          lat,
          lon,
          intensity,
          speed_kmh: speed,
          delay_minutes: delay
        });
      }

      mockData.push({
        timestamp: `${hour.toString().padStart(2, '0')}:00`,
        hour,
        data
      });
    }

    setHeatmapData(mockData);
  };

  const drawHeatmap = () => {
    const canvas = canvasRef.current;
    if (!canvas || !heatmapData.length || !selectedArea) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas;
    const currentData = heatmapData.find(d => d.hour === currentHour);
    if (!currentData) return;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    const [minLon, minLat, maxLon, maxLat] = selectedArea.bbox;

    // Draw heatmap points
    currentData.data.forEach(point => {
      const x = ((point.lon - minLon) / (maxLon - minLon)) * width;
      const y = height - ((point.lat - minLat) / (maxLat - minLat)) * height;

      let value = point.intensity;
      let color = '';

      switch (heatmapType) {
        case 'speed':
          value = 1 - (point.speed_kmh / 80); // Invert speed (lower speed = higher intensity)
          break;
        case 'delay':
          value = Math.min(1, point.delay_minutes / 15);
          break;
        case 'intensity':
        default:
          value = point.intensity;
          break;
      }

      // Color gradient from green to red
      if (value < 0.2) color = `rgba(34, 197, 94, ${opacity[0]})`;
      else if (value < 0.4) color = `rgba(234, 179, 8, ${opacity[0]})`;
      else if (value < 0.6) color = `rgba(249, 115, 22, ${opacity[0]})`;
      else if (value < 0.8) color = `rgba(239, 68, 68, ${opacity[0]})`;
      else color = `rgba(168, 85, 247, ${opacity[0]})`;

      // Draw point with blur effect
      ctx.shadowColor = color;
      ctx.shadowBlur = 15;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, 2 * Math.PI);
      ctx.fill();
    });

    ctx.shadowBlur = 0;
  };

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handlePrevious = () => {
    setCurrentHour(prev => (prev - 1 + 24) % 24);
  };

  const handleNext = () => {
    setCurrentHour(prev => (prev + 1) % 24);
  };

  const handleReset = () => {
    setCurrentHour(0);
    setIsPlaying(false);
  };

  const handleExport = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const link = document.createElement('a');
      link.download = `heatmap-${currentHour.toString().padStart(2, '0')}00.png`;
      link.href = canvas.toDataURL();
      link.click();
    }
  };

  const currentDataStats = heatmapData.find(d => d.hour === currentHour);
  const avgIntensity = currentDataStats ? 
    currentDataStats.data.reduce((sum, d) => sum + d.intensity, 0) / currentDataStats.data.length : 0;

  return (
    <div className="space-y-6">
      {error && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-orange-700">
              <AlertTriangle className="h-4 w-4" />
              <p className="text-sm">
                Unable to fetch live data. Showing sample heatmap for demonstration.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Congestion Heatmap</span>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">
                {currentHour.toString().padStart(2, '0')}:00
              </Badge>
              {avgIntensity > 0 && (
                <Badge variant={avgIntensity > 0.6 ? "destructive" : avgIntensity > 0.3 ? "default" : "secondary"}>
                  {Math.round(avgIntensity * 100)}% congested
                </Badge>
              )}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Playback Controls */}
          <div className="flex items-center justify-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
            >
              <SkipBack className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrevious}
            >
              ← Prev
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handlePlayPause}
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {isPlaying ? 'Pause' : 'Play'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleNext}
            >
              Next →
            </Button>
          </div>

          {/* Time Slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Hour: {currentHour.toString().padStart(2, '0')}:00</span>
              <span>24-hour cycle</span>
            </div>
            <Slider
              value={[currentHour]}
              onValueChange={([value]) => setCurrentHour(value)}
              max={23}
              step={1}
              className="w-full"
            />
          </div>

          {/* Configuration */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t">
            <div className="space-y-2">
              <Label>Heatmap Type</Label>
              <Select value={heatmapType} onValueChange={(value: 'intensity' | 'speed' | 'delay') => setHeatmapType(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="intensity">Congestion Intensity</SelectItem>
                  <SelectItem value="speed">Speed (Inverted)</SelectItem>
                  <SelectItem value="delay">Delay Time</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Opacity: {Math.round(opacity[0] * 100)}%</Label>
              <Slider
                value={opacity}
                onValueChange={setOpacity}
                max={1}
                min={0.1}
                step={0.1}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <Label>Play Speed</Label>
              <Select value={playSpeed.toString()} onValueChange={(value) => setPlaySpeed(parseInt(value))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="500">2x Fast</SelectItem>
                  <SelectItem value="1000">Normal</SelectItem>
                  <SelectItem value="2000">Slow</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t">
            <div className="flex items-center space-x-2">
              <Switch
                id="legend"
                checked={showLegend}
                onCheckedChange={setShowLegend}
              />
              <Label htmlFor="legend">Show Legend</Label>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
            >
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Heatmap Canvas */}
      <Card>
        <CardContent className="p-0 relative">
          <canvas
            ref={canvasRef}
            width={800}
            height={600}
            className="w-full h-auto bg-gray-50 dark:bg-gray-900"
            style={{ aspectRatio: '4/3' }}
          />
          
          {showLegend && (
            <div className="absolute bottom-4 right-4 bg-background/90 backdrop-blur-sm border rounded-lg p-3">
              <div className="text-xs font-medium mb-2">
                {heatmapType === 'intensity' && 'Congestion Level'}
                {heatmapType === 'speed' && 'Speed Impact'}
                {heatmapType === 'delay' && 'Delay Time'}
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs">
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  <span>Low</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <div className="w-3 h-3 rounded-full bg-yellow-500" />
                  <span>Moderate</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <span>High</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <div className="w-3 h-3 rounded-full bg-purple-500" />
                  <span>Severe</span>
                </div>
              </div>
            </div>
          )}

          {currentDataStats && (
            <div className="absolute top-4 left-4 bg-background/90 backdrop-blur-sm border rounded-lg p-3">
              <div className="text-sm font-medium">
                {currentDataStats.timestamp}
              </div>
              <div className="text-xs text-muted-foreground">
                {currentDataStats.data.length} data points
              </div>
              <div className="text-xs text-muted-foreground">
                Avg: {Math.round(avgIntensity * 100)}% congested
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Instructions */}
      <Card>
        <CardContent className="pt-4">
          <div className="text-sm text-muted-foreground space-y-1">
            <p>• Use the time controls to explore traffic patterns throughout the day</p>
            <p>• Press Play to animate through a 24-hour cycle</p>
            <p>• Switch between different heatmap types to see speed, delay, or congestion intensity</p>
            <p>• Adjust opacity and play speed for better visualization</p>
            <p>• Export individual frames as PNG images for reports</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}