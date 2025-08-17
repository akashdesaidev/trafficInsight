"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, Clock, Car, TrendingUp, MapPin, ChevronDown, ChevronUp, Shield, Info } from "lucide-react";
import { osmCache, type OSMCapacityResponse } from "@/lib/osmCache";

interface LiveCluster {
  id: string;
  center: { lat: number; lon: number };
  score: number;
  severity_mean: number;
  severity_peak: number;
  incident_count: number;
  closure: boolean;
  support: number;
  count: number;
  road_name?: string | null;
}

interface ApiResponse {
  clusters: LiveCluster[];
}

interface Props {
  selectedArea?: { bbox: [number, number, number, number]; name?: string };
  onChokepointClick?: (chokepoint: LiveCluster) => void;
}

// Helper function to get severity configuration
const getSeverityConfig = (meanSeverity: number) => {
  if (meanSeverity >= 0.8) return { 
    color: 'bg-red-500', 
    textColor: 'text-red-600',
    bgColor: 'bg-red-50',
    icon: '🚨', 
    label: 'Critical', 
    description: 'Severe congestion' 
  };
  if (meanSeverity >= 0.6) return { 
    color: 'bg-orange-500', 
    textColor: 'text-orange-600',
    bgColor: 'bg-orange-50',
    icon: '⚠️', 
    label: 'High', 
    description: 'Heavy traffic' 
  };
  if (meanSeverity >= 0.4) return { 
    color: 'bg-yellow-500', 
    textColor: 'text-yellow-600',
    bgColor: 'bg-yellow-50',
    icon: '⚡', 
    label: 'Moderate', 
    description: 'Slow moving' 
  };
  return { 
    color: 'bg-green-500', 
    textColor: 'text-green-600',
    bgColor: 'bg-green-50',
    icon: '✅', 
    label: 'Light', 
    description: 'Minor delays' 
  };
};

// Enhanced traffic description with OSM integration
const getEnhancedTrafficDescription = async (chokepoint: LiveCluster): Promise<{
  delay: string;
  impact: string;
  severity: string;
  trend: string;
  confidence: string;
  estimationMethod: string;
  roadContext?: {
    name: string;
    highway_type: string;
    lanes: number;
    estimated_capacity_per_hour: number;
    maxspeed: number;
  };
  calculationFactors?: {
    base_multiplier: number;
    capacity_factor: number;
    highway_factor: number;
    lane_factor: number;
    final_multiplier: number;
  };
}> => {
  const delayMinutes = Math.round(chokepoint.score * 0.1);
  const trend = chokepoint.score > 85 ? '📈 Worsening' : chokepoint.score > 70 ? '➡️ Stable' : '📉 Improving';
  const severity = `${Math.round(chokepoint.severity_mean * 100)}% above normal speed`;
  
  try {
    const osmData = await osmCache.getCapacityEstimate({
      lat: chokepoint.center.lat,
      lon: chokepoint.center.lon,
      dataPoints: chokepoint.count
    });
    
    if (osmData.success && osmData.osm_data_available) {
      return {
        delay: `~${delayMinutes} min delay`,
        impact: `${osmData.estimated_vehicles}+ vehicles affected`,
        severity,
        trend,
        confidence: osmData.confidence,
        estimationMethod: osmData.estimation_method,
        roadContext: osmData.road_context,
        calculationFactors: osmData.calculation_factors
      };
    }
  } catch (error) {
    console.warn('OSM integration failed for chokepoint:', chokepoint.id, error);
  }
  
  // Fallback to simple estimation
  const simpleVehicles = chokepoint.count * 15;
  return {
    delay: `~${delayMinutes} min delay`,
    impact: `${simpleVehicles}+ vehicles affected`,
    severity,
    trend,
    confidence: 'low',
    estimationMethod: 'simple_fallback'
  };
};

// Simple synchronous version for initial render
const getTrafficDescription = (score: number, meanSeverity: number, count: number) => {
  const delayMinutes = Math.round(score * 0.1);
  const affectedVehicles = count * 15;
  
  return {
    delay: `~${delayMinutes} min delay`,
    impact: `${affectedVehicles}+ vehicles affected`,
    severity: `${Math.round(meanSeverity * 100)}% above normal speed`,
    trend: score > 85 ? '📈 Worsening' : score > 70 ? '➡️ Stable' : '📉 Improving',
    confidence: 'low',
    estimationMethod: 'simple_fallback'
  };
};

// Helper function to format location
const formatLocation = (roadName: string | null, center: {lat: number, lon: number}) => {
  const coordinates = `${center.lat.toFixed(4)}, ${center.lon.toFixed(4)}`;
  return {
    primary: roadName || 'Unknown Road',
    coordinates
  };
};

export default function LiveLeaderboard({ selectedArea, onChokepointClick }: Props) {
  const [clusters, setClusters] = useState<LiveCluster[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'score' | 'severity' | 'impact'>('score');
  const [filterSeverity, setFilterSeverity] = useState<'all' | 'critical' | 'high'>('all');
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [enhancedDescriptions, setEnhancedDescriptions] = useState<Map<string, any>>(new Map());
  const [loadingEnhanced, setLoadingEnhanced] = useState<Set<string>>(new Set());
  const timerRef = useRef<number | null>(null);

  const fetchLive = async () => {
    setLoading(true);
    setError(null);
    
    // Create AbortController with 90-second timeout to handle slow backend processing
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90000);
    
    try {
      // Backend now defaults to Bangalore; no bbox required
      // Use same parameters as LiveChokepointsMarkers for consistency
      const url = `/api/traffic/live-chokepoints?z=14&eps_m=300&min_samples=5&jf_min=4.0&include_geocode=true`;
      const res = await fetch(url, { 
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' }
      });
      
      clearTimeout(timeoutId);
      
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errorText}`);
      }
      
      const data: ApiResponse = await res.json();
      setClusters(Array.isArray(data?.clusters) ? data.clusters : []);
    } catch (e) {
      clearTimeout(timeoutId);
      if (e instanceof Error && e.name === 'AbortError') {
        setError("Request timed out - backend processing takes >90s. Try reducing parameters or check server logs.");
      } else {
        setError(e instanceof Error ? e.message : "Failed to load live chokepoints");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // initial
    fetchLive();
    // poll every 60s
    timerRef.current = window.setInterval(fetchLive, 600000);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  // Batch preload OSM data for top chokepoints
  useEffect(() => {
    const preloadOSMData = async () => {
      if (clusters.length === 0) return;
      
      // Preload OSM data for top 5 most severe chokepoints
      const topChokepoints = [...clusters]
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .filter(cp => !enhancedDescriptions.has(cp.id));
      
      if (topChokepoints.length === 0) return;
      
      console.log(`Preloading OSM data for ${topChokepoints.length} chokepoints...`);
      
      // Process in batches of 3 to avoid overwhelming the API
      for (let i = 0; i < topChokepoints.length; i += 3) {
        const batch = topChokepoints.slice(i, i + 3);
        
        await Promise.all(
          batch.map(async (chokepoint) => {
            try {
              const enhanced = await getEnhancedTrafficDescription(chokepoint);
              setEnhancedDescriptions(prev => new Map(prev).set(chokepoint.id, enhanced));
            } catch (error) {
              console.warn(`Failed to preload OSM data for chokepoint ${chokepoint.id}:`, error);
            }
          })
        );
        
        // Small delay between batches to be respectful to the API
        if (i + 3 < topChokepoints.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    };
    
    // Debounce preloading to avoid excessive API calls
    const timeoutId = setTimeout(preloadOSMData, 2000);
    return () => clearTimeout(timeoutId);
  }, [clusters]);

  const ranked = useMemo(() => {
    let filtered = clusters.slice();
    
    // Apply severity filter
    if (filterSeverity === 'critical') {
      filtered = filtered.filter(c => c.severity_mean >= 0.8);
    } else if (filterSeverity === 'high') {
      filtered = filtered.filter(c => c.severity_mean >= 0.6);
    }
    
    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'severity':
          return b.severity_mean - a.severity_mean;
        case 'impact':
          return (b.count * b.severity_mean) - (a.count * a.severity_mean);
        default:
          return b.score - a.score;
      }
    });
    
    return filtered;
  }, [clusters, sortBy, filterSeverity]);
  
  // Calculate summary statistics
  const summaryStats = useMemo(() => {
    const total = clusters.length;
    const critical = clusters.filter(c => c.severity_mean >= 0.8).length;
    const high = clusters.filter(c => c.severity_mean >= 0.6 && c.severity_mean < 0.8).length;
    const withIncidents = clusters.filter(c => c.incident_count > 0).length;
    const avgScore = total > 0 ? clusters.reduce((sum, c) => sum + c.score, 0) / total : 0;
    
    return { total, critical, high, withIncidents, avgScore };
  }, [clusters]);
  
  const toggleExpanded = async (id: string) => {
    const newExpanded = new Set(expandedItems);
    const isExpanding = !newExpanded.has(id);
    
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedItems(newExpanded);
    
    // Load enhanced description when expanding
    if (isExpanding && !enhancedDescriptions.has(id)) {
      const chokepoint = clusters.find(cp => cp.id === id);
      if (chokepoint) {
        setLoadingEnhanced(prev => new Set(prev).add(id));
        try {
          const enhanced = await getEnhancedTrafficDescription(chokepoint);
          setEnhancedDescriptions(prev => new Map(prev).set(id, enhanced));
        } catch (error) {
          console.error('Failed to load enhanced description:', error);
        } finally {
          setLoadingEnhanced(prev => {
            const newSet = new Set(prev);
            newSet.delete(id);
            return newSet;
          });
        }
      }
    }
  };

  return (
    <Card>
      <CardHeader className="space-y-4">
        <div className="flex flex-row items-center justify-between">
          <CardTitle>Live Choke Points (Realtime)</CardTitle>
          {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
        </div>
        
        {/* Summary Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div className="bg-blue-50 p-3 rounded-lg">
            <div className="font-medium text-blue-900">{summaryStats.total}</div>
            <div className="text-blue-600">Total Points</div>
          </div>
          <div className="bg-red-50 p-3 rounded-lg">
            <div className="font-medium text-red-900">{summaryStats.critical}</div>
            <div className="text-red-600">Critical</div>
          </div>
          <div className="bg-orange-50 p-3 rounded-lg">
            <div className="font-medium text-orange-900">{summaryStats.high}</div>
            <div className="text-orange-600">High Severity</div>
          </div>
          <div className="bg-purple-50 p-3 rounded-lg">
            <div className="font-medium text-purple-900">{summaryStats.withIncidents}</div>
            <div className="text-purple-600">With Incidents</div>
          </div>
        </div>
        
        {/* Controls */}
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Sort by:</span>
            <Select value={sortBy} onValueChange={(value: 'score' | 'severity' | 'impact') => setSortBy(value)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="score">Score</SelectItem>
                <SelectItem value="severity">Severity</SelectItem>
                <SelectItem value="impact">Impact</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Filter:</span>
            <Select value={filterSeverity} onValueChange={(value: 'all' | 'critical' | 'high') => setFilterSeverity(value)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Levels</SelectItem>
                <SelectItem value="critical">Critical Only</SelectItem>
                <SelectItem value="high">High+ Only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {error ? (
          <div className="text-sm text-red-600">{error}</div>
        ) : null}
        <ScrollArea className="h-[400px]">
          <div className="space-y-3">
            {ranked.map((c, idx) => {
              const severityConfig = getSeverityConfig(c.severity_mean);
              const trafficDesc = getTrafficDescription(c.score, c.severity_mean, c.count);
              const location = formatLocation(c.road_name, c.center);
              const isExpanded = expandedItems.has(c.id);
              
              return (
                <div key={c.id} className={`border rounded-lg transition-all duration-200 ${severityConfig.bgColor} border-l-4 ${severityConfig.color.replace('bg-', 'border-l-')}`}>
                  <div className="p-4">
                    <div className="flex items-start justify-between">
                      <div 
                        className="flex items-start gap-4 flex-1 cursor-pointer hover:bg-gray-50 rounded-lg p-2 -m-2 transition-colors duration-200"
                        onClick={() => onChokepointClick?.(c)}
                        title="Click to center map on this chokepoint"
                      >
                        {/* Rank Badge */}
                        <Badge variant="outline" className="w-8 h-8 rounded-full flex items-center justify-center font-bold">
                          {idx + 1}
                        </Badge>
                        
                        {/* Main Content */}
                        <div className="flex-1 min-w-0">
                          {/* Header */}
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-lg">{severityConfig.icon}</span>
                            <div className="font-semibold text-lg truncate">{location.primary}</div>
                            <Badge className={`${severityConfig.color} text-white text-xs`}>
                              {severityConfig.label}
                            </Badge>
                          </div>
                          
                          {/* Key Metrics */}
                          <div className="grid grid-cols-2 gap-3 mb-3">
                            <div className="flex items-center gap-2">
                              <Clock className="h-4 w-4 text-blue-500" />
                              <span className="text-sm font-medium">{trafficDesc.delay}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Car className="h-4 w-4 text-green-500" />
                              <span className="text-sm">{trafficDesc.impact}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <TrendingUp className="h-4 w-4 text-orange-500" />
                              <span className="text-sm">{trafficDesc.trend}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <MapPin className="h-4 w-4 text-purple-500" />
                              <span className="text-sm">Score: {c.score.toFixed(1)}</span>
                            </div>
                          </div>
                          
                          {/* Status Badges */}
                          <div className="flex flex-wrap gap-2 mb-2">
                            {c.incident_count > 0 && (
                              <Badge className="bg-orange-100 text-orange-800 text-xs">
                                🚨 {c.incident_count} incident{c.incident_count > 1 ? 's' : ''}
                              </Badge>
                            )}
                            {c.closure && (
                              <Badge className="bg-purple-100 text-purple-800 text-xs">
                                🚧 Road Closure
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      {/* Expand Button */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleExpanded(c.id)}
                        className="ml-2"
                      >
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                    </div>
                    
                    {/* Expanded Details */}
                    {isExpanded && (
                      <div className="mt-4 pt-4 border-t border-gray-200 space-y-3">
                        {/* Enhanced Traffic Description */}
                        {loadingEnhanced.has(c.id) ? (
                          <div className="flex items-center justify-center py-4">
                            <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                            <span className="text-sm text-gray-600">Loading enhanced analysis...</span>
                          </div>
                        ) : enhancedDescriptions.has(c.id) ? (
                          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="font-medium text-blue-900 flex items-center">
                                <Shield className="h-4 w-4 mr-2" />
                                Enhanced Traffic Analysis
                              </h4>
                              <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                                enhancedDescriptions.get(c.id)?.confidence === 'high' 
                                  ? 'bg-green-100 text-green-800'
                                  : enhancedDescriptions.get(c.id)?.confidence === 'medium'
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : 'bg-red-100 text-red-800'
                              }`}>
                                {enhancedDescriptions.get(c.id)?.confidence} confidence
                              </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4 text-sm mb-3">
                              <div>
                                <span className="font-medium text-blue-700">Impact:</span>
                                <p className="text-blue-900">{enhancedDescriptions.get(c.id)?.impact}</p>
                              </div>
                              <div>
                                <span className="font-medium text-blue-700">Delay:</span>
                                <p className="text-blue-900">{enhancedDescriptions.get(c.id)?.delay}</p>
                              </div>
                            </div>
                            
                            {/* Road Context */}
                            {enhancedDescriptions.get(c.id)?.roadContext && (
                              <div className="bg-white p-3 rounded border border-blue-200 mb-3">
                                <h5 className="font-medium text-blue-800 mb-2 flex items-center">
                                  <MapPin className="h-4 w-4 mr-1" />
                                  Road Information
                                </h5>
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                  <div>
                                    <span className="text-gray-600">Name:</span>
                                    <p className="font-medium">{enhancedDescriptions.get(c.id)?.roadContext?.name || 'Unknown'}</p>
                                  </div>
                                  <div>
                                    <span className="text-gray-600">Type:</span>
                                    <p className="font-medium capitalize">{enhancedDescriptions.get(c.id)?.roadContext?.highway_type}</p>
                                  </div>
                                  <div>
                                    <span className="text-gray-600">Lanes:</span>
                                    <p className="font-medium">{enhancedDescriptions.get(c.id)?.roadContext?.lanes}</p>
                                  </div>
                                  <div>
                                    <span className="text-gray-600">Speed Limit:</span>
                                    <p className="font-medium">{enhancedDescriptions.get(c.id)?.roadContext?.maxspeed} km/h</p>
                                  </div>
                                  <div className="col-span-2">
                                    <span className="text-gray-600">Estimated Capacity:</span>
                                    <p className="font-medium">{enhancedDescriptions.get(c.id)?.roadContext?.estimated_capacity_per_hour} vehicles/hour</p>
                                  </div>
                                </div>
                              </div>
                            )}
                            
                            {/* Calculation Details */}
                            {enhancedDescriptions.get(c.id)?.calculationFactors && (
                              <details className="bg-white p-3 rounded border border-blue-200">
                                <summary className="cursor-pointer font-medium text-blue-800 text-sm flex items-center">
                                  <Info className="h-4 w-4 mr-1" />
                                  Calculation Details
                                </summary>
                                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                                  <div>
                                    <span className="text-gray-600">Base Multiplier:</span>
                                    <p className="font-mono">{enhancedDescriptions.get(c.id)?.calculationFactors?.base_multiplier}</p>
                                  </div>
                                  <div>
                                    <span className="text-gray-600">Capacity Factor:</span>
                                    <p className="font-mono">{enhancedDescriptions.get(c.id)?.calculationFactors?.capacity_factor}</p>
                                  </div>
                                  <div>
                                    <span className="text-gray-600">Highway Factor:</span>
                                    <p className="font-mono">{enhancedDescriptions.get(c.id)?.calculationFactors?.highway_factor}</p>
                                  </div>
                                  <div>
                                    <span className="text-gray-600">Lane Factor:</span>
                                    <p className="font-mono">{enhancedDescriptions.get(c.id)?.calculationFactors?.lane_factor}</p>
                                  </div>
                                  <div className="col-span-2">
                                    <span className="text-gray-600">Final Multiplier:</span>
                                    <p className="font-mono font-medium">{enhancedDescriptions.get(c.id)?.calculationFactors?.final_multiplier}</p>
                                  </div>
                                </div>
                                <div className="mt-2 text-xs text-gray-600">
                                  Method: {enhancedDescriptions.get(c.id)?.estimationMethod}
                                </div>
                              </details>
                            )}
                          </div>
                        ) : null}
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                          <div>
                            <h4 className="font-medium mb-2">Traffic Details</h4>
                            <div className="space-y-1">
                              <div>Mean Severity: <span className="font-medium">{(c.severity_mean * 100).toFixed(0)}%</span></div>
                              <div>Peak Severity: <span className="font-medium">{(c.severity_peak * 100).toFixed(0)}%</span></div>
                              <div>Data Points: <span className="font-medium">{c.count}</span></div>
                              <div>Support: <span className="font-medium">{c.support}</span></div>
                            </div>
                          </div>
                          <div>
                            <h4 className="font-medium mb-2">Location</h4>
                            <div className="space-y-1">
                              <div>Road: <span className="font-medium">{location.primary}</span></div>
                              <div>Coordinates: <span className="font-mono text-xs">{location.coordinates}</span></div>
                              <div>Cluster ID: <span className="font-mono text-xs">{c.id}</span></div>
                            </div>
                          </div>
                        </div>
                        
                        {/* Progress Bar for Severity */}
                        <div>
                          <div className="flex justify-between text-xs mb-1">
                            <span>Congestion Level</span>
                            <span>{(c.severity_mean * 100).toFixed(0)}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div 
                              className={`h-2 rounded-full ${severityConfig.color}`}
                              style={{ width: `${Math.min(c.severity_mean * 100, 100)}%` }}
                            ></div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {ranked.length === 0 && !loading ? (
              <div className="text-center py-8 text-muted-foreground">
                {filterSeverity !== 'all' ? 'No chokepoints match the current filter.' : 'No live choke points detected.'}
              </div>
            ) : null}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}


