"use client";

import { useEffect, useState } from "react";
import type { TomTomMap } from "@/types/tomtom";

interface Props {
  visible: boolean;
  map: TomTomMap | null;
}

interface TrafficFlowPoint {
  coordinates: [number, number];
  currentSpeed: number;
  freeFlowSpeed: number;
  currentTravelTime: number;
  freeFlowTravelTime: number;
  confidence: number;
  roadClosure: boolean;
}

interface TrafficFlowData {
  flowSegmentData: TrafficFlowPoint[];
  version: string;
}

export default function TrafficFlowLayer({ visible, map }: Props) {

  useEffect(() => {
    if (!visible || !map) {
      // Remove existing traffic visualization
      removeTrafficVisualization(map);
      return;
    }

    const fetchTrafficData = async () => {
      try {
        // Get current map bounds
        const bounds = map.getBounds?.();
        if (!bounds) return;

        const sw = bounds.getSouthWest();
        const ne = bounds.getNorthEast();
        const bbox = `${sw.lng},${sw.lat},${ne.lng},${ne.lat}`;
        const zoom = map.getZoom?.() || 10;

        const response = await fetch(`/api/traffic/flow-data?bbox=${bbox}&zoom=${zoom}`);
        if (response.ok) {
          const data = await response.json();
          visualizeTrafficFlow(map, data);
        } else {
          console.warn('Failed to fetch traffic flow data:', response.status);
        }
      } catch (error) {
        console.error('Error fetching traffic data:', error);
      }
    };

    // Initial fetch
    fetchTrafficData();

    // Re-fetch when map moves
    const handleMoveEnd = () => {
      if (visible) {
        fetchTrafficData();
      }
    };

    // Auto-refresh every 2 minutes
    const interval = setInterval(() => {
      if (visible) {
        fetchTrafficData();
      }
    }, 120000);

    // Listen for map events
    if (map.on) {
      map.on('moveend', handleMoveEnd);
    }

    return () => {
      clearInterval(interval);
      if (map.off) {
        map.off('moveend', handleMoveEnd);
      }
      removeTrafficVisualization(map);
    };
  }, [visible, map]);

  return null;
}

function visualizeTrafficFlow(map: TomTomMap | null, data: TrafficFlowData) {
  if (!map || !data?.flowSegmentData) return;

  // Remove existing visualization
  removeTrafficVisualization(map);

  // Create GeoJSON features for traffic points
  const features = data.flowSegmentData.map((point, index) => {
    const speedRatio = point.currentSpeed / point.freeFlowSpeed;
    
    // Determine color based on speed ratio
    let color = '#22c55e'; // Green - free flow
    if (speedRatio < 0.3) {
      color = '#dc2626'; // Red - heavy congestion
    } else if (speedRatio < 0.5) {
      color = '#ea580c'; // Orange - moderate congestion
    } else if (speedRatio < 0.7) {
      color = '#eab308'; // Yellow - light congestion
    }

    // Road closure
    if (point.roadClosure) {
      color = '#7c3aed'; // Purple - road closure
    }

    return {
      type: 'Feature',
      properties: {
        id: `traffic-point-${index}`,
        currentSpeed: point.currentSpeed,
        freeFlowSpeed: point.freeFlowSpeed,
        speedRatio: speedRatio,
        color: color,
        roadClosure: point.roadClosure,
        delay: point.currentTravelTime - point.freeFlowTravelTime
      },
      geometry: {
        type: 'Point',
        coordinates: point.coordinates
      }
    };
  });

  const geojsonData = {
    type: 'FeatureCollection',
    features: features
  };

  try {
    // Add source
    map.addSource('traffic-flow-points', {
      type: 'geojson',
      data: geojsonData
    });

    // Add circle layer for traffic points
    map.addLayer({
      id: 'traffic-flow-circles',
      type: 'circle',
      source: 'traffic-flow-points',
      paint: {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          8, 3,
          16, 8
        ],
        'circle-color': ['get', 'color'],
        'circle-opacity': 0.8,
        'circle-stroke-width': 1,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-opacity': 0.8
      }
    });

    // Add popup on click
    map.on('click', 'traffic-flow-circles', (e: { features?: any[]; lngLat: any }) => {
      if (e.features && e.features.length > 0) {
        const feature = e.features[0];
        const props = feature.properties;
        
        const popupContent = `
          <div style="padding: 8px; min-width: 200px;">
            <h4 style="margin: 0 0 8px 0; font-weight: bold;">Traffic Information</h4>
            ${props.roadClosure ? 
              '<p style="color: #7c3aed; font-weight: bold; margin: 4px 0;">🚧 Road Closure</p>' : ''
            }
            <p style="margin: 4px 0;"><strong>Current Speed:</strong> ${props.currentSpeed} km/h</p>
            <p style="margin: 4px 0;"><strong>Free Flow Speed:</strong> ${props.freeFlowSpeed} km/h</p>
            <p style="margin: 4px 0;"><strong>Speed Ratio:</strong> ${(props.speedRatio * 100).toFixed(0)}%</p>
            ${props.delay > 0 ? 
              `<p style="margin: 4px 0;"><strong>Delay:</strong> ${props.delay} minutes</p>` : ''
            }
            <div style="margin-top: 8px; font-size: 12px; color: #666;">
              ${getTrafficDescription(props.speedRatio, props.roadClosure)}
            </div>
          </div>
        `;

        new (window as any).tt.Popup({ offset: 25 })
          .setLngLat(e.lngLat)
          .setHTML(popupContent)
          .addTo(map);
      }
    });

    // Change cursor on hover
    map.on('mouseenter', 'traffic-flow-circles', () => {
      if (map.getCanvas) {
        map.getCanvas().style.cursor = 'pointer';
      }
    });

    map.on('mouseleave', 'traffic-flow-circles', () => {
      if (map.getCanvas) {
        map.getCanvas().style.cursor = '';
      }
    });

  } catch (error) {
    console.error('Error adding traffic visualization:', error);
  }
}

function removeTrafficVisualization(map: TomTomMap | null) {
  if (!map) return;

  try {
    // Remove event listeners
    map.off('click', 'traffic-flow-circles');
    map.off('mouseenter', 'traffic-flow-circles');
    map.off('mouseleave', 'traffic-flow-circles');

    // Remove layers and sources
    if (map.getLayer && map.getLayer('traffic-flow-circles')) {
      map.removeLayer('traffic-flow-circles');
    }
    if (map.getSource && map.getSource('traffic-flow-points')) {
      map.removeSource('traffic-flow-points');
    }
  } catch {
    // Ignore errors when cleaning up
  }
}

function getTrafficDescription(speedRatio: number, roadClosure: boolean): string {
  if (roadClosure) {
    return '🚧 Road is closed to traffic';
  }
  
  if (speedRatio >= 0.8) {
    return '🟢 Free flowing traffic';
  } else if (speedRatio >= 0.6) {
    return '🟡 Light traffic';
  } else if (speedRatio >= 0.4) {
    return '🟠 Moderate congestion';
  } else if (speedRatio >= 0.2) {
    return '🔴 Heavy traffic';
  } else {
    return '🔴 Severe congestion';
  }
}