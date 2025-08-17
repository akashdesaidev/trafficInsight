"use client";

import { useEffect, useState, useCallback } from "react";
import type { TomTomMap } from "@/types/tomtom";
import { useMapStore } from "@/store/mapStore";
import { osmCache } from "@/lib/osmCache";

interface LiveChokepoint {
  id: string;
  center: {
    lat: number;
    lon: number;
  };
  score: number;
  severity_mean: number;
  severity_peak: number;
  count: number;
  road_name?: string;
  incident_count: number;
  closure: boolean;
  support: number;
}

interface LiveChokepointsResponse {
  clusters: LiveChokepoint[];
  total_count?: number;
  processing_time_ms?: number;
  cache_hit?: boolean;
}

interface Props {
  visible: boolean;
  map: TomTomMap | null;
  onChokepointClick?: (chokepoint: LiveChokepoint) => void;
}

export default function LiveChokepointsMarkers({ visible, map, onChokepointClick }: Props) {
  const [chokepoints, setChokepoints] = useState<LiveChokepoint[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enhancedChokepoints, setEnhancedChokepoints] = useState<Map<string, any>>(new Map());
  
  const liveChokepointsLayer = useMapStore((s) => s.liveChokepointsLayer);
  const bounds = useMapStore((s) => s.bounds);

  // Fetch live chokepoints data
  const fetchChokepoints = useCallback(async () => {
    if (!visible || !map) return;

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        z: '14',
        eps_m: '300',
        min_samples: '5',
        jf_min: '4.0',
        incident_radius_m: '100',
        include_geocode: 'true'
      });

      const response = await fetch(`/api/traffic/live-chokepoints?${params}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: LiveChokepointsResponse = await response.json();
      console.log('Live chokepoints API response:', data);
      
      // API already filters by jf_min=4.0 for moderate/severe traffic only
      const chokepoints = data.clusters || [];
      
      console.log(`Received chokepoints: ${chokepoints.length} (API filtered by jf_min=4.0 for moderate/severe traffic)`);
      setChokepoints(chokepoints);
      
      // Preload OSM data for top chokepoints
      preloadOSMData(chokepoints);
    } catch (err) {
      console.error('Error fetching live chokepoints:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch chokepoints');
    } finally {
      setIsLoading(false);
    }
  }, [visible, map]);
  
  // Preload OSM data for enhanced vehicle estimation
  const preloadOSMData = useCallback(async (chokepointList: LiveChokepoint[]) => {
    if (chokepointList.length === 0) return;
    
    // Preload for top 3 most severe chokepoints
    const topChokepoints = [...chokepointList]
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .filter(cp => !enhancedChokepoints.has(cp.id));
    
    if (topChokepoints.length === 0) return;
    
    console.log(`Preloading OSM data for ${topChokepoints.length} chokepoints...`);
    
    for (const chokepoint of topChokepoints) {
      try {
        const osmData = await osmCache.getCapacityEstimate({
          lat: chokepoint.center.lat,
          lon: chokepoint.center.lon,
          dataPoints: chokepoint.count
        });
        
        if (osmData.success) {
          setEnhancedChokepoints(prev => new Map(prev).set(chokepoint.id, {
            ...chokepoint,
            enhancedVehicles: osmData.estimated_vehicles,
            confidence: osmData.confidence,
            roadContext: osmData.road_context,
            osmDataAvailable: osmData.osm_data_available
          }));
        }
      } catch (error) {
        console.warn(`Failed to preload OSM data for chokepoint ${chokepoint.id}:`, error);
      }
    }
  }, [enhancedChokepoints]);
  
  // Handle chokepoint click
  const handleChokepointClick = useCallback(async (e: any) => {
    if (!onChokepointClick) return;
    
    const features = map?.queryRenderedFeatures(e.point, {
      layers: ['live-chokepoints-circles']
    });
    
    if (features && features.length > 0) {
      const feature = features[0];
      const chokepointId = feature.properties?.id;
      
      if (chokepointId) {
        const chokepoint = chokepoints.find(cp => cp.id === chokepointId);
        if (chokepoint) {
          // Get or load enhanced data
          let enhancedData = enhancedChokepoints.get(chokepointId);
          
          if (!enhancedData) {
            try {
              const osmData = await osmCache.getCapacityEstimate({
                lat: chokepoint.center.lat,
                lon: chokepoint.center.lon,
                dataPoints: chokepoint.count
              });
              
              enhancedData = {
                ...chokepoint,
                enhancedVehicles: osmData.estimated_vehicles,
                confidence: osmData.confidence,
                roadContext: osmData.road_context,
                osmDataAvailable: osmData.osm_data_available
              };
              
              setEnhancedChokepoints(prev => new Map(prev).set(chokepointId, enhancedData));
            } catch (error) {
              console.warn('Failed to load OSM data on click:', error);
              enhancedData = chokepoint;
            }
          }
          
          onChokepointClick(enhancedData);
        }
      }
    }
  }, [map, chokepoints, enhancedChokepoints, onChokepointClick]);

  // Initial fetch and periodic refresh
  useEffect(() => {
    if (!visible || !map) return;

    fetchChokepoints();

    const interval = setInterval(
      fetchChokepoints,
      liveChokepointsLayer.refreshInterval * 60 * 1000
    );

    return () => clearInterval(interval);
  }, [fetchChokepoints, liveChokepointsLayer.refreshInterval, visible, map]);

  // Helper: add/remove layers safely when style is loaded
  const safelyAddLayers = useCallback(() => {
    if (!map) return;

    try {
      // Remove existing source if it exists
      if (map.getSource && map.getSource('live-chokepoints')) {
        try { map.removeLayer('live-chokepoints-circles'); } catch {}
        try { map.removeLayer('live-chokepoints-labels'); } catch {}
        map.removeSource('live-chokepoints');
      }

      if (chokepoints.length === 0) return;

      // Create GeoJSON data with enhanced vehicle counts
      const geojsonData = {
        type: 'FeatureCollection' as const,
        features: chokepoints.map((cp) => {
          const enhanced = enhancedChokepoints.get(cp.id);
          const vehicleCount = enhanced?.enhancedVehicles || (cp.count * 15); // Fallback to simple estimation
          const confidence = enhanced?.confidence || 'low';
          
          return {
            type: 'Feature' as const,
            geometry: {
              type: 'Point' as const,
              coordinates: [cp.center.lon, cp.center.lat],
            },
            properties: {
              id: cp.id,
              score: cp.score,
              mean_severity: cp.severity_mean,
              peak_severity: cp.severity_peak,
              sample_count: cp.count,
              road_name: cp.road_name || 'Unknown Road',
              incident_count: cp.incident_count,
              closure: cp.closure,
              support: cp.support,
              vehicle_count: vehicleCount,
              confidence: confidence,
              osm_enhanced: !!enhanced?.osmDataAvailable,
            },
          };
        }),
      };

      // Add source
      map.addSource('live-chokepoints', {
        type: 'geojson',
        data: geojsonData,
      });
      
      console.log('Added live chokepoints source with data:', geojsonData);

      // Add circle layer for chokepoint markers
      map.addLayer({
        id: 'live-chokepoints-circles',
        type: 'circle',
        source: 'live-chokepoints',
        paint: {
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['get', 'score'],
            0, 8,
            50, 12,
            100, 16
          ],
          'circle-color': [
            'interpolate',
            ['linear'],
            ['get', 'mean_severity'],
            0, '#22c55e', // Green for low severity
            0.3, '#eab308', // Yellow for medium severity
            0.6, '#f97316', // Orange for high severity
            0.8, '#ef4444', // Red for very high severity
            1.0, '#991b1b'  // Dark red for critical severity
          ],
          'circle-opacity': 0.8,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-opacity': 0.9,
        },
      });

      console.log('Added live chokepoints circles layer');
      
      // Add labels if enabled (omit explicit text-font to avoid glyph 404s)
      if (liveChokepointsLayer.showLabels) {
        map.addLayer({
          id: 'live-chokepoints-labels',
          type: 'symbol',
          source: 'live-chokepoints',
          layout: {
            'text-field': ['get', 'road_name'],
            // Use style default fonts/glyphs to avoid 404s
            'text-size': 12,
            'text-offset': [0, 2],
            'text-anchor': 'top',
          },
          paint: {
            'text-color': '#1f2937',
            'text-halo-color': '#ffffff',
            'text-halo-width': 1,
          },
        });
        console.log('Added live chokepoints labels layer');
      }
      
      // Add click handler for interactivity
      if (onChokepointClick) {
        map.on('click', 'live-chokepoints-circles', handleChokepointClick);
        // Change cursor to pointer when hovering over chokepoints
        map.on('mouseenter', 'live-chokepoints-circles', () => {
          if (map.getCanvas) {
            map.getCanvas().style.cursor = 'pointer';
          }
        });
        map.on('mouseleave', 'live-chokepoints-circles', () => {
          if (map.getCanvas) {
            map.getCanvas().style.cursor = '';
          }
        });
      }
    } catch (error) {
      console.error('Error adding live chokepoints to map:', error);
      console.error('Chokepoints data:', chokepoints);
      console.error('Map object:', map);
      setError('Failed to display chokepoints on map');
    }
  }, [map, chokepoints, enhancedChokepoints, liveChokepointsLayer.showLabels, onChokepointClick, handleChokepointClick]);

  // Add/remove chokepoint markers on map
  useEffect(() => {
    if (!map || !visible) {
      // Remove existing markers and event listeners
      try {
        if (map?.getSource && map.getSource('live-chokepoints')) {
          // Remove event listeners
          if (onChokepointClick) {
            try { map.off('click', 'live-chokepoints-circles', handleChokepointClick); } catch {}
            try { map.off('mouseenter', 'live-chokepoints-circles'); } catch {}
            try { map.off('mouseleave', 'live-chokepoints-circles'); } catch {}
          }
          // Remove layers and source
          try { map.removeLayer('live-chokepoints-circles'); } catch {}
          try { map.removeLayer('live-chokepoints-labels'); } catch {}
          map.removeSource('live-chokepoints');
        }
      } catch (e) {
        // Ignore errors when removing non-existent layers
      }
      return;
    }

    // Ensure style is loaded before adding layers
    const addWhenReady = () => safelyAddLayers();

    if ((map as any).isStyleLoaded && (map as any).isStyleLoaded()) {
      addWhenReady();
    } else {
      try {
        // @ts-expect-error TomTom event types
        map.once('load', addWhenReady);
      } catch {
        // Fallback if once/load not available
        setTimeout(addWhenReady, 300);
      }
    }

    // Cleanup listeners when dependencies change
    return () => {
      try {
        // @ts-expect-error TomTom event types
        map.off('load', addWhenReady);
        // Remove click event listeners
        if (onChokepointClick) {
          try { map.off('click', 'live-chokepoints-circles', handleChokepointClick); } catch {}
          try { map.off('mouseenter', 'live-chokepoints-circles'); } catch {}
          try { map.off('mouseleave', 'live-chokepoints-circles'); } catch {}
        }
      } catch {}
    };
  }, [map, visible, chokepoints, safelyAddLayers]);

  // Debug info (optional)
  useEffect(() => {
    if (visible) {
      console.log(`Live chokepoints: visible=${visible}, loaded=${chokepoints.length} points, map=${!!map}`);
      if (chokepoints.length > 0) {
        console.log('Sample chokepoint:', chokepoints[0]);
      }
    }
  }, [visible, chokepoints, map]);

  return null; // This component doesn't render anything directly
}