"use client";

import { useMapStore } from "@/store/mapStore";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Map,
  BarChart3,
  Download,
  Settings,
  Layers,

  RefreshCw,
  ChevronDown,
  ChevronRight,
  Info,
  MapPin,
  Clock,
  AlertTriangle,
  Eye,
  EyeOff,
  Gauge,
  Palette,
  Timer,
  Bug,
  Minimize2,
  Maximize2,
} from "lucide-react";

interface SidebarProps {
  selectedArea?: {
    bbox: [number, number, number, number];
    name?: string;
  };
  onAnalyticsOpen?: () => void;
  onExportOpen?: () => void;
}

export function TrafficControlSidebar({
  selectedArea,
  onAnalyticsOpen,
  onExportOpen,
}: SidebarProps) {
  // Global state
  const {
    trafficLayer,
    incidentLayer,
    liveChokepointsLayer,
    mapSettings,
    sidebarCollapsed,
    setTrafficVisible,
    setTrafficOpacity,
    setTrafficStyle,
    setTrafficThickness,
    setIncidentsVisible,
    setIncidentSeverityFilter,
    setIncidentTimeFilter,
    setLiveChokepointsVisible,
    setLiveChokepointsRefreshInterval,
    setLiveChokepointsShowLabels,
    setAutoRefresh,
    setRefreshInterval,
    setShowDebugInfo,
    setSidebarCollapsed,
  } = useMapStore();

  // Force refresh function
  const forceRefresh = () => {
    const wasVisible = trafficLayer.visible;
    setTrafficVisible(false);
    setTimeout(() => setTrafficVisible(wasVisible), 100);
  };

  // Severity filter toggles
  const toggleSeverityFilter = (
    severity: "low" | "medium" | "high" | "critical"
  ) => {
    const currentFilters = incidentLayer.severityFilter;
    const newFilters = currentFilters.includes(severity)
      ? currentFilters.filter((s) => s !== severity)
      : [...currentFilters, severity];
    setIncidentSeverityFilter(newFilters);
  };

  if (sidebarCollapsed) {
    return (
      <div className="w-12 h-full bg-white border-r border-gray-200 flex flex-col items-center py-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setSidebarCollapsed(false)}
          className="p-2"
        >
          <Maximize2 className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <aside className="w-80 h-full bg-white border-r border-gray-200 flex flex-col">
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Map className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold">Traffic Control</h2>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSidebarCollapsed(true)}
            className="p-2"
          >
            <Minimize2 className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-sm text-gray-600">
          Manage traffic layers, incidents, and map settings
        </p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Selected Area Info */}
          {selectedArea && (
            <Card className="bg-blue-50 border-blue-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-blue-600" />
                  Selected Area
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-sm">
                  <div className="font-medium text-blue-900">
                    {selectedArea.name || "Custom Selection"}
                  </div>
                  <div className="text-blue-700 text-xs mt-1 font-mono">
                    {selectedArea.bbox[0].toFixed(4)},{" "}
                    {selectedArea.bbox[1].toFixed(4)} →{" "}
                    {selectedArea.bbox[2].toFixed(4)},{" "}
                    {selectedArea.bbox[3].toFixed(4)}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={onAnalyticsOpen}
                    className="flex-1"
                  >
                    <BarChart3 className="h-4 w-4 mr-1" />
                    Analytics
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={onExportOpen}
                    className="flex-1"
                  >
                    <Download className="h-4 w-4 mr-1" />
                    Export
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Traffic Flow Layer */}
          <Collapsible defaultOpen>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className="w-full justify-between p-3 h-auto"
              >
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4" />
                  <span className="font-medium">Traffic Flow</span>
                  <Badge variant="secondary" className="text-xs">
                    Live
                  </Badge>
                </div>
                <ChevronDown className="h-4 w-4" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <Card>
                <CardContent className="p-4 space-y-4">
                  {/* Visibility Toggle */}
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="traffic-visible"
                      className="flex items-center gap-2"
                    >
                      {trafficLayer.visible ? (
                        <Eye className="h-4 w-4 text-green-600" />
                      ) : (
                        <EyeOff className="h-4 w-4 text-gray-400" />
                      )}
                      Show Layer
                    </Label>
                    <Switch
                      id="traffic-visible"
                      checked={trafficLayer.visible}
                      onCheckedChange={setTrafficVisible}
                    />
                  </div>

                  {trafficLayer.visible && (
                    <>
                      <Separator />

                      {/* Opacity Control */}
                      <div className="space-y-2">
                        <Label className="text-sm flex items-center gap-2">
                          <Gauge className="h-4 w-4" />
                          Opacity: {trafficLayer.opacity}%
                        </Label>
                        <Slider
                          value={[trafficLayer.opacity]}
                          onValueChange={([value]) => setTrafficOpacity(value)}
                          max={100}
                          min={0}
                          step={5}
                          className="w-full"
                        />
                      </div>

                      {/* Style Selection */}
                      <div className="space-y-2">
                        <Label className="text-sm flex items-center gap-2">
                          <Palette className="h-4 w-4" />
                          Style
                        </Label>
                        <Select
                          value={trafficLayer.style}
                          onValueChange={setTrafficStyle}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="relative">
                              Relative Speed
                            </SelectItem>
                            <SelectItem value="absolute">
                              Absolute Speed
                            </SelectItem>
                            <SelectItem value="relative-delay">
                              Relative Delay
                            </SelectItem>
                            <SelectItem value="reduced-sensitivity">
                              Reduced Sensitivity
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Thickness Control */}
                      <div className="space-y-2">
                        <Label className="text-sm">
                          Line Thickness: {trafficLayer.thickness}
                        </Label>
                        <Slider
                          value={[trafficLayer.thickness]}
                          onValueChange={([value]) =>
                            setTrafficThickness(value)
                          }
                          max={20}
                          min={1}
                          step={1}
                          className="w-full"
                        />
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </CollapsibleContent>
          </Collapsible>

          {/* Traffic Incidents Layer */}
          <Collapsible defaultOpen>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className="w-full justify-between p-3 h-auto"
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="font-medium">Traffic Incidents</span>
                  <Badge variant="destructive" className="text-xs">
                    Alerts
                  </Badge>
                </div>
                <ChevronDown className="h-4 w-4" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <Card>
                <CardContent className="p-4 space-y-4">
                  {/* Visibility Toggle */}
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="incidents-visible"
                      className="flex items-center gap-2"
                    >
                      {incidentLayer.visible ? (
                        <Eye className="h-4 w-4 text-green-600" />
                      ) : (
                        <EyeOff className="h-4 w-4 text-gray-400" />
                      )}
                      Show Incidents
                    </Label>
                    <Switch
                      id="incidents-visible"
                      checked={incidentLayer.visible}
                      onCheckedChange={setIncidentsVisible}
                    />
                  </div>

                  {incidentLayer.visible && (
                    <>
                      <Separator />

                      {/* Severity Filters */}
                      <div className="space-y-2">
                        <Label className="text-sm">Severity Levels</Label>
                        <div className="flex flex-wrap gap-2">
                          {(["low", "medium", "high", "critical"] as const).map(
                            (severity) => (
                              <Badge
                                key={severity}
                                variant={
                                  incidentLayer.severityFilter.includes(
                                    severity
                                  )
                                    ? "default"
                                    : "outline"
                                }
                                className="cursor-pointer hover:bg-gray-100"
                                onClick={() => toggleSeverityFilter(severity)}
                              >
                                {severity.charAt(0).toUpperCase() +
                                  severity.slice(1)}
                              </Badge>
                            )
                          )}
                        </div>
                      </div>

                      {/* Time Filter */}
                      <div className="space-y-2">
                        <Label className="text-sm flex items-center gap-2">
                          <Timer className="h-4 w-4" />
                          Time Range
                        </Label>
                        <Select
                          value={incidentLayer.timeFilter}
                          onValueChange={setIncidentTimeFilter}
                        >
                          <SelectTrigger>
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
                    </>
                  )}
                </CardContent>
              </Card>
            </CollapsibleContent>
          </Collapsible>

          {/* Live Chokepoints Layer */}
          <Collapsible defaultOpen>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className="w-full justify-between p-3 h-auto"
              >
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  <span className="font-medium">Live Chokepoints</span>
                  <Badge variant="secondary" className="text-xs">
                    Real-time
                  </Badge>
                </div>
                <ChevronDown className="h-4 w-4" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <Card>
                <CardContent className="p-4 space-y-4">
                  {/* Visibility Toggle */}
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="chokepoints-visible"
                      className="flex items-center gap-2"
                    >
                      {liveChokepointsLayer.visible ? (
                        <Eye className="h-4 w-4 text-green-600" />
                      ) : (
                        <EyeOff className="h-4 w-4 text-gray-400" />
                      )}
                      Show Chokepoints
                    </Label>
                    <Switch
                      id="chokepoints-visible"
                      checked={liveChokepointsLayer.visible}
                      onCheckedChange={setLiveChokepointsVisible}
                    />
                  </div>

                  {liveChokepointsLayer.visible && (
                    <>
                      <Separator />

                      {/* Refresh Interval */}
                      <div className="space-y-2">
                        <Label className="text-sm flex items-center gap-2">
                          <Clock className="h-4 w-4" />
                          Refresh Interval
                        </Label>
                        <Select
                          value={liveChokepointsLayer.refreshInterval.toString()}
                          onValueChange={(value) =>
                            setLiveChokepointsRefreshInterval(parseInt(value))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="5">5 minutes</SelectItem>
                            <SelectItem value="10">10 minutes</SelectItem>
                            <SelectItem value="15">15 minutes</SelectItem>
                            <SelectItem value="30">30 minutes</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Show Labels Toggle */}
                      <div className="flex items-center justify-between">
                        <Label
                          htmlFor="chokepoints-labels"
                          className="flex items-center gap-2"
                        >
                          <Info className="h-4 w-4" />
                          Show Labels
                        </Label>
                        <Switch
                          id="chokepoints-labels"
                          checked={liveChokepointsLayer.showLabels}
                          onCheckedChange={setLiveChokepointsShowLabels}
                        />
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </CollapsibleContent>
          </Collapsible>

          {/* Settings */}
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className="w-full justify-between p-3 h-auto"
              >
                <div className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  <span className="font-medium">Settings</span>
                </div>
                <ChevronDown className="h-4 w-4" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <Card>
                <CardContent className="p-4 space-y-4">
                  {/* Auto Refresh */}
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="auto-refresh"
                      className="flex items-center gap-2"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Auto Refresh
                    </Label>
                    <Switch
                      id="auto-refresh"
                      checked={mapSettings.autoRefresh}
                      onCheckedChange={setAutoRefresh}
                    />
                  </div>

                  {mapSettings.autoRefresh && (
                    <div className="space-y-2">
                      <Label className="text-sm">Refresh Interval</Label>
                      <Select
                        value={mapSettings.refreshInterval.toString()}
                        onValueChange={(value) =>
                          setRefreshInterval(parseInt(value))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="30">30 seconds</SelectItem>
                          <SelectItem value="60">1 minute</SelectItem>
                          <SelectItem value="120">2 minutes</SelectItem>
                          <SelectItem value="300">5 minutes</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Manual Refresh */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={forceRefresh}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh Now
                  </Button>

                  <Separator />

                  {/* Debug Info Toggle */}
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor="debug-info"
                      className="flex items-center gap-2"
                    >
                      <Bug className="h-4 w-4" />
                      Debug Info
                    </Label>
                    <Switch
                      id="debug-info"
                      checked={mapSettings.showDebugInfo}
                      onCheckedChange={setShowDebugInfo}
                    />
                  </div>
                </CardContent>
              </Card>
            </CollapsibleContent>
          </Collapsible>

          {/* Status Info */}
          <Card className="bg-gray-50">
            <CardContent className="p-4">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-blue-600 mt-0.5" />
                <div className="text-xs text-gray-700 space-y-1">
                  <div className="font-medium">Status</div>
                  <div>
                    Traffic: {trafficLayer.visible ? "✓ Active" : "✗ Hidden"}
                  </div>
                  <div>
                    Incidents: {incidentLayer.visible ? "✓ Active" : "✗ Hidden"}
                  </div>
                  <div>
                    Chokepoints: {liveChokepointsLayer.visible ? "✓ Active" : "✗ Hidden"}
                  </div>
                  <div>
                    Auto Refresh:{" "}
                    {mapSettings.autoRefresh
                      ? `✓ ${mapSettings.refreshInterval}s`
                      : "✗ Off"}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-2 space-y-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={() => {
                  setTrafficVisible(true);
                  setIncidentsVisible(true);
                  setTrafficOpacity(80);
                }}
              >
                <Eye className="h-4 w-4 mr-2" />
                Show All Layers
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={() => {
                  setTrafficVisible(false);
                  setIncidentsVisible(false);
                }}
              >
                <EyeOff className="h-4 w-4 mr-2" />
                Hide All Layers
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start"
                onClick={() => {
                  setTrafficOpacity(80);
                  setTrafficThickness(10);
                  setTrafficStyle("relative");
                  setIncidentSeverityFilter([
                    "low",
                    "medium",
                    "high",
                    "critical",
                  ]);
                }}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Reset to Defaults
              </Button>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </aside>
  );
}
