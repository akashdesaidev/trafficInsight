"use client";

import { useState } from "react";
import { useMapStore } from "@/store/mapStore";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Map,
  BarChart3,
  Download,
  Settings,
  Eye,
  EyeOff,
  MapPin,
  Clock,
  Layers,
  Filter,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Info,
} from "lucide-react";

interface SidebarProps {
  selectedArea?: {
    bbox: [number, number, number, number];
    name?: string;
  };
  onAnalyticsOpen: () => void;
  onExportOpen: () => void;
}

export function Sidebar({ selectedArea, onAnalyticsOpen, onExportOpen }: SidebarProps) {
  // Global state from zustand store
  const trafficLayer = useMapStore((state) => state.trafficLayer);
  const incidentLayer = useMapStore((state) => state.incidentLayer);
  const autoRefreshInterval = useMapStore((state) => state.autoRefreshInterval);
  
  const setTrafficVisible = useMapStore((state) => state.setTrafficVisible);
  const setTrafficOpacity = useMapStore((state) => state.setTrafficOpacity);
  const setTrafficStyle = useMapStore((state) => state.setTrafficStyle);
  const setIncidentsVisible = useMapStore((state) => state.setIncidentsVisible);
  const setAutoRefreshInterval = useMapStore((state) => state.setAutoRefreshInterval);
  
  // Local UI state
  const [layersExpanded, setLayersExpanded] = useState(true);
  const [filtersExpanded, setFiltersExpanded] = useState(true);
  const [settingsExpanded, setSettingsExpanded] = useState(false);

  return (
    <aside className="w-72 h-full bg-white border-r border-gray-200 flex flex-col">
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Header */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Map className="h-5 w-5 text-blue-600" />
              <h2 className="text-lg font-semibold">Traffic Control</h2>
            </div>
            <p className="text-sm text-gray-600">
              Manage layers, filters, and analysis tools
            </p>
          </div>

          <Separator />

          {/* Selected Area Info */}
          {selectedArea && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Selected Area
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-sm">
                  <div className="font-medium">{selectedArea.name || 'Custom Area'}</div>
                  <div className="text-gray-600 text-xs mt-1">
                    {selectedArea.bbox[0].toFixed(4)}, {selectedArea.bbox[1].toFixed(4)} → {' '}
                    {selectedArea.bbox[2].toFixed(4)}, {selectedArea.bbox[3].toFixed(4)}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={onAnalyticsOpen} className="flex-1">
                    <BarChart3 className="h-4 w-4 mr-1" />
                    Analytics
                  </Button>
                  <Button size="sm" variant="outline" onClick={onExportOpen} className="flex-1">
                    <Download className="h-4 w-4 mr-1" />
                    Export
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Map Layers */}
          <Card>
            <CardHeader className="pb-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-between p-0 h-auto"
                onClick={() => setLayersExpanded(!layersExpanded)}
              >
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4" />
                  <span className="font-medium">Map Layers</span>
                </div>
                {layersExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </Button>
            </CardHeader>
            {layersExpanded && (
              <CardContent className="space-y-4">
                {/* Traffic Flow Layer */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="traffic-layer" className="text-sm font-medium">
                        Traffic Flow
                      </Label>
                      <Badge variant="secondary" className="text-xs">Live</Badge>
                    </div>
                    <Switch
                      id="traffic-layer"
                      checked={trafficLayer.visible}
                      onCheckedChange={setTrafficVisible}
                    />
                  </div>
                  
                  {trafficLayer.visible && (
                    <div className="space-y-3 ml-4 border-l border-gray-200 pl-3">
                      <div className="space-y-2">
                        <Label className="text-xs text-gray-600">Opacity</Label>
                        <Slider
                          value={[trafficLayer.opacity]}
                          onValueChange={([value]) => setTrafficOpacity(value)}
                          max={100}
                          min={0}
                          step={10}
                          className="w-full"
                        />
                        <div className="text-xs text-gray-500 text-right">
                          {trafficLayer.opacity}%
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <Label className="text-xs text-gray-600">Style</Label>
                        <Select value={trafficLayer.style} onValueChange={setTrafficStyle}>
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="relative-dark">Relative Dark</SelectItem>
                            <SelectItem value="relative-light">Relative Light</SelectItem>
                            <SelectItem value="absolute">Absolute</SelectItem>
                            <SelectItem value="reduced-sensitivity">Reduced Sensitivity</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </div>

                <Separator />

                {/* Traffic Incidents Layer */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="incidents-layer" className="text-sm font-medium">
                      Traffic Incidents
                    </Label>
                    <Badge variant="destructive" className="text-xs">Alerts</Badge>
                  </div>
                  <Switch
                    id="incidents-layer"
                    checked={incidentLayer.visible}
                    onCheckedChange={setIncidentsVisible}
                  />
                </div>
              </CardContent>
            )}
          </Card>

          {/* Filters */}
          <Card>
            <CardHeader className="pb-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-between p-0 h-auto"
                onClick={() => setFiltersExpanded(!filtersExpanded)}
              >
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4" />
                  <span className="font-medium">Filters</span>
                </div>
                {filtersExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </Button>
            </CardHeader>
            {filtersExpanded && (
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <Label className="text-sm">Incident Severity</Label>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="outline" className="cursor-pointer hover:bg-gray-100">
                      Low
                    </Badge>
                    <Badge variant="outline" className="cursor-pointer hover:bg-gray-100">
                      Medium
                    </Badge>
                    <Badge variant="outline" className="cursor-pointer hover:bg-gray-100">
                      High
                    </Badge>
                    <Badge variant="outline" className="cursor-pointer hover:bg-gray-100">
                      Critical
                    </Badge>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm">Time Range</Label>
                  <Select defaultValue="current">
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="current">Current</SelectItem>
                      <SelectItem value="1h">Last Hour</SelectItem>
                      <SelectItem value="6h">Last 6 Hours</SelectItem>
                      <SelectItem value="24h">Last 24 Hours</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            )}
          </Card>

          {/* Settings */}
          <Card>
            <CardHeader className="pb-2">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-between p-0 h-auto"
                onClick={() => setSettingsExpanded(!settingsExpanded)}
              >
                <div className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  <span className="font-medium">Settings</span>
                </div>
                {settingsExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </Button>
            </CardHeader>
            {settingsExpanded && (
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <Label className="text-sm">Auto Refresh</Label>
                  <Select 
                    value={autoRefreshInterval.toString()} 
                    onValueChange={(value) => setAutoRefreshInterval(parseInt(value))}
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="30">30 seconds</SelectItem>
                      <SelectItem value="60">1 minute</SelectItem>
                      <SelectItem value="300">5 minutes</SelectItem>
                      <SelectItem value="0">Disabled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full"
                  onClick={() => {
                    // Force refresh by toggling traffic layer
                    const wasVisible = trafficLayer.visible;
                    setTrafficVisible(false);
                    setTimeout(() => setTrafficVisible(wasVisible), 100);
                  }}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh Now
                </Button>
              </CardContent>
            )}
          </Card>

          {/* Help */}
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="p-3">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-blue-600 mt-0.5" />
                <div className="text-xs text-blue-700">
                  <div className="font-medium mb-1">Quick Start</div>
                  <div>Draw an area on the map to enable analytics and export features.</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </aside>
  );
}