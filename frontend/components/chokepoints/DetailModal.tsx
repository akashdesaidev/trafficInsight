"use client";

import { useState, useEffect } from "react";
import { 
  X, MapPin, Clock, TrendingUp, AlertTriangle, BarChart3, Calendar,
  Gauge, Navigation, Construction, RefreshCw, Zap, Activity
} from "lucide-react";
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
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
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
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useLiveTrafficData } from "@/hooks/useLiveTrafficData";
import { EnhancedChokepoint } from "@/types/liveTraffic";

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

// Removed historical data interfaces - only live data is used

// Removed historical data constants

export function ChokepointDetailModal({ chokepoint, isOpen, onClose }: ChokepointDetailModalProps) {
  const [activeTab, setActiveTab] = useState("live-metrics");

  // Live traffic data hook
  const {
    data: liveData,
    loading: liveLoading,
    error: liveError,
    metrics,
    incidentImpact,
    roadCapacity,
    refetch: refetchLiveData
  } = useLiveTrafficData({
    lat: chokepoint.location.lat,
    lon: chokepoint.location.lon,
    enabled: isOpen
  });

  // Removed historical data fetching - only live data is used



  // Helper functions for live data display
  const formatTime = (hour: number) => `${hour.toString().padStart(2, '0')}:00`;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[90vw] w-full max-h-[95vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              {chokepoint.road_name} - Choke Point Analysis
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={refetchLiveData}
              disabled={Object.values(liveLoading).some(Boolean)}
              className="flex items-center gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${Object.values(liveLoading).some(Boolean) ? 'animate-spin' : ''}`} />
              Refresh Live Data
            </Button>
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="live-metrics">Live Metrics</TabsTrigger>
            <TabsTrigger value="incidents">Incidents</TabsTrigger>
            <TabsTrigger value="infrastructure">Infrastructure</TabsTrigger>
          </TabsList>

          <ScrollArea className="max-h-[calc(95vh-12rem)]">
            {/* Removed overview tab - only live data is available */}

            {/* Live Traffic Metrics Tab */}
            <TabsContent value="live-metrics" className="space-y-6 mt-4">
              {liveError.flowSegment && (
                <Card className="border-red-200 bg-red-50">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 text-red-700">
                      <AlertTriangle className="h-4 w-4" />
                      <p className="text-sm">{liveError.flowSegment}</p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Real-time Performance Metrics */}
              <div className="grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Gauge className="h-4 w-4" />
                      Current Speed
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {liveLoading.flowSegment ? (
                      <div className="animate-pulse h-8 bg-gray-200 rounded"></div>
                    ) : liveData.flowSegment ? (
                      <>
                        <div className="text-2xl font-bold text-blue-600">
                          {liveData.flowSegment.flowSegmentData.currentSpeed} km/h
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Free flow: {liveData.flowSegment.flowSegmentData.freeFlowSpeed} km/h
                        </div>
                      </>
                    ) : (
                      <div className="text-sm text-muted-foreground">No data</div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Travel Time
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {liveLoading.flowSegment ? (
                      <div className="animate-pulse h-8 bg-gray-200 rounded"></div>
                    ) : liveData.flowSegment ? (
                      <>
                        <div className="text-2xl font-bold text-orange-600">
                          {Math.round(liveData.flowSegment.flowSegmentData.currentTravelTime)} sec
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Free flow: {Math.round(liveData.flowSegment.flowSegmentData.freeFlowTravelTime)} sec
                        </div>
                      </>
                    ) : (
                      <div className="text-sm text-muted-foreground">No data</div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" />
                      Efficiency
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {liveLoading.flowSegment ? (
                      <div className="animate-pulse h-8 bg-gray-200 rounded"></div>
                    ) : metrics ? (
                      <>
                        <div className={`text-2xl font-bold ${
                          metrics.efficiency > 80 ? 'text-green-600' :
                          metrics.efficiency > 60 ? 'text-yellow-600' : 'text-red-600'
                        }`}>
                          {metrics.efficiency.toFixed(1)}%
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Speed efficiency
                        </div>
                      </>
                    ) : (
                      <div className="text-sm text-muted-foreground">No data</div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Activity className="h-4 w-4" />
                      Congestion Level
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {liveLoading.flowSegment ? (
                      <div className="animate-pulse h-8 bg-gray-200 rounded"></div>
                    ) : metrics ? (
                      <>
                        <Badge className={`text-sm ${
                          metrics.congestionLevel === 'free' ? 'bg-green-100 text-green-800' :
                          metrics.congestionLevel === 'light' ? 'bg-yellow-100 text-yellow-800' :
                          metrics.congestionLevel === 'moderate' ? 'bg-orange-100 text-orange-800' :
                          metrics.congestionLevel === 'heavy' ? 'bg-red-100 text-red-800' :
                          'bg-purple-100 text-purple-800'
                        }`}>
                          {metrics.congestionLevel.toUpperCase()}
                        </Badge>
                        <div className="text-xs text-muted-foreground mt-2">
                          {metrics.speedReduction.toFixed(1)}% speed reduction
                        </div>
                      </>
                    ) : (
                      <div className="text-sm text-muted-foreground">No data</div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Traffic Flow Visualization */}
              {metrics && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Zap className="h-5 w-5" />
                      Traffic Flow Analysis
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div>
                        <div className="flex justify-between text-sm mb-2">
                          <span>Speed Reduction</span>
                          <span>{metrics.speedReduction.toFixed(1)}%</span>
                        </div>
                        <Progress value={metrics.speedReduction} className="h-2" />
                      </div>
                      <div>
                        <div className="flex justify-between text-sm mb-2">
                          <span>Delay Factor</span>
                          <span>{metrics.delayFactor.toFixed(2)}x</span>
                        </div>
                        <Progress value={Math.min(100, (metrics.delayFactor - 1) * 50)} className="h-2" />
                      </div>
                      <div>
                        <div className="flex justify-between text-sm mb-2">
                          <span>Traffic Efficiency</span>
                          <span>{metrics.efficiency.toFixed(1)}%</span>
                        </div>
                        <Progress value={metrics.efficiency} className="h-2" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Incidents Tab */}
            <TabsContent value="incidents" className="space-y-6 mt-4">
              {liveError.incidents && (
                <Card className="border-red-200 bg-red-50">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 text-red-700">
                      <AlertTriangle className="h-4 w-4" />
                      <p className="text-sm">{liveError.incidents}</p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Incident Impact Summary */}
              {incidentImpact && (
                <div className="grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Nearby Incidents</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-orange-600">
                        {incidentImpact.nearbyIncidents}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Within 1km radius
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Impact Level</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Badge className={`${
                        incidentImpact.severityLevel === 'high' ? 'bg-red-100 text-red-800' :
                        incidentImpact.severityLevel === 'medium' ? 'bg-orange-100 text-orange-800' :
                        'bg-green-100 text-green-800'
                      }`}>
                        {incidentImpact.severityLevel.toUpperCase()}
                      </Badge>
                      {incidentImpact.hasRoadClosure && (
                        <div className="text-xs text-red-600 mt-2 font-medium">
                          ⚠️ Road closure detected
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Est. Delay</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-red-600">
                        +{incidentImpact.estimatedDelay} min
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Due to incidents
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Incident Details */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5" />
                    Active Incidents
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {liveLoading.incidents ? (
                    <div className="space-y-3">
                      {[1, 2, 3].map(i => (
                        <div key={i} className="animate-pulse h-16 bg-gray-200 rounded"></div>
                      ))}
                    </div>
                  ) : liveData.incidents.length > 0 ? (
                    <div className="space-y-4">
                      {liveData.incidents.map((incident, index) => (
                        <div key={incident.id || index} className="border rounded-lg p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <Badge className={`${
                                  incident.severity === 'major' ? 'bg-red-100 text-red-800' :
                                  incident.severity === 'moderate' ? 'bg-orange-100 text-orange-800' :
                                  incident.severity === 'minor' ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-gray-100 text-gray-800'
                                }`}>
                                  {incident.severity?.toUpperCase() || 'UNKNOWN'}
                                </Badge>
                                <span className="text-sm text-muted-foreground">
                                  {incident.type}
                                </span>
                              </div>
                              <p className="text-sm">
                                {incident.description || 'No description available'}
                              </p>
                              {incident.startTime && (
                                <p className="text-xs text-muted-foreground mt-2">
                                  Started: {new Date(incident.startTime).toLocaleString()}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p className="text-lg font-medium mb-2">No Active Incidents</p>
                      <p className="text-sm">No traffic incidents detected in this area.</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Infrastructure Tab */}
            <TabsContent value="infrastructure" className="space-y-6 mt-4">
              {liveError.roadInfo && (
                <Card className="border-red-200 bg-red-50">
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 text-red-700">
                      <AlertTriangle className="h-4 w-4" />
                      <p className="text-sm">{liveError.roadInfo}</p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Road Infrastructure Overview */}
              {roadCapacity && liveData.roadInfo && (
                <div className="grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Road Type</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-lg font-bold text-blue-600 capitalize">
                        {liveData.roadInfo.highway_type.replace('_', ' ')}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {liveData.roadInfo.name}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Lanes</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-green-600">
                        {liveData.roadInfo.lanes}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {liveData.roadInfo.oneway ? 'One-way' : 'Two-way'}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Speed Limit</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-orange-600">
                        {liveData.roadInfo.maxspeed} km/h
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Maximum speed
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Capacity</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-lg font-bold text-purple-600">
                        {roadCapacity.theoreticalCapacity.toLocaleString()}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Vehicles/hour
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Infrastructure Analysis */}
              {roadCapacity && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Construction className="h-5 w-5" />
                      Infrastructure Analysis
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="text-center">
                          <div className="text-2xl font-bold text-blue-600 mb-2">
                            {roadCapacity.infrastructureScore.toFixed(0)}/100
                          </div>
                          <div className="text-sm text-muted-foreground">Infrastructure Score</div>
                          <Progress value={roadCapacity.infrastructureScore} className="mt-2" />
                        </div>
                        
                        <div className="text-center">
                          <div className="text-2xl font-bold text-orange-600 mb-2">
                            {roadCapacity.currentUtilization.toFixed(1)}%
                          </div>
                          <div className="text-sm text-muted-foreground">Current Utilization</div>
                          <Progress value={roadCapacity.currentUtilization} className="mt-2" />
                        </div>
                        
                        <div className="text-center">
                          <Badge className={`text-sm mb-2 ${
                            roadCapacity.bottleneckRisk === 'high' ? 'bg-red-100 text-red-800' :
                            roadCapacity.bottleneckRisk === 'medium' ? 'bg-orange-100 text-orange-800' :
                            'bg-green-100 text-green-800'
                          }`}>
                            {roadCapacity.bottleneckRisk.toUpperCase()} RISK
                          </Badge>
                          <div className="text-sm text-muted-foreground">Bottleneck Risk</div>
                        </div>
                      </div>

                      {liveData.roadInfo && (
                        <div className="border-t pt-4">
                          <h4 className="font-medium mb-3">Road Details</h4>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="text-muted-foreground">Surface:</span>
                              <span className="ml-2 capitalize">
                                {liveData.roadInfo.surface || 'Unknown'}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Direction:</span>
                              <span className="ml-2">
                                {liveData.roadInfo.oneway ? 'One-way' : 'Bidirectional'}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Loading state for infrastructure */}
              {liveLoading.roadInfo && (
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                      <p className="text-sm text-muted-foreground">Loading road infrastructure data...</p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* No data state */}
              {!liveLoading.roadInfo && !liveData.roadInfo && !liveError.roadInfo && (
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center py-8 text-muted-foreground">
                      <Construction className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p className="text-lg font-medium mb-2">Infrastructure Data Unavailable</p>
                      <p className="text-sm">No road infrastructure information found for this location.</p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}