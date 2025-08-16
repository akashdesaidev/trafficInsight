"use client";

import { useState, useEffect } from "react";
import { Badge } from "../ui/badge";

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

const LiveLeaderboard = ({
  bbox,
  onChokepointSelect,
}: {
  bbox: string;
  onChokepointSelect: (location: { lat: number; lon: number } | null) => void;
}) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<LiveCluster[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const fetchLive = async () => {
    setLoading(true);

    // Abort controller for 90s timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90000);

    try {
      const url = `/api/traffic/live-chokepoints?z=14&eps_m=200&min_samples=3&jf_min=7&include_geocode=true&bbox=${bbox}`;
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errorText}`);
      }

      const data: ApiResponse = await res.json();
      setData(Array.isArray(data?.clusters) ? data.clusters : []);
    } catch (e) {
      clearTimeout(timeoutId);
      if (e instanceof Error && e.name === "AbortError") {
        console.log(
          "Request timed out - backend processing takes >90s. Try reducing parameters or check server logs."
        );
      } else {
        console.log(
          e instanceof Error ? e.message : "Failed to load live chokepoints"
        );
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    console.log(`Fetching data for bbox: ${bbox}`);
    fetchLive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bbox]);

  const handleSelect = (cluster: LiveCluster) => {
    setSelectedId(cluster.id);
    onChokepointSelect({ lat: cluster.center.lat, lon: cluster.center.lon });
  };

  if (loading) {
    return <div className="text-center p-4">Loading...</div>;
  }

  return (
    <div>
      <ul className="space-y-2">
        {data.map((c, idx) => (
          <div
            key={c.id}
            onClick={() => handleSelect(c)}
            className={`flex items-center justify-between p-4 border rounded-lg cursor-pointer transition-colors ${
              selectedId === c.id
                ? "bg-blue-50 border-blue-400"
                : "hover:bg-gray-50"
            }`}
          >
            <div className="flex items-center gap-4">
              <Badge
                variant="outline"
                className="w-8 h-8 rounded-full flex items-center justify-center"
              >
                {idx + 1}
              </Badge>
              <div className="min-w-0">
                <div className="font-medium truncate">
                  {c.road_name ? c.road_name : `Score: ${c.score.toFixed(1)}`}
                </div>
                <div className="text-xs text-muted-foreground">
                  Score: {c.score.toFixed(1)}
                </div>
                <div className="text-xs text-muted-foreground">
                  Mean: {(c.severity_mean * 100).toFixed(0)}% • Peak:{" "}
                  {(c.severity_peak * 100).toFixed(0)}% • Points: {c.count}
                </div>
                <div className="text-xs text-muted-foreground">
                  Center: {c.center.lat.toFixed(5)}, {c.center.lon.toFixed(5)}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {c.incident_count > 0 && (
                <Badge className="bg-orange-100 text-orange-800">
                  Incidents: {c.incident_count}
                </Badge>
              )}
              {c.closure && (
                <Badge className="bg-purple-100 text-purple-800">Closure</Badge>
              )}
            </div>
          </div>
        ))}
      </ul>
    </div>
  );
};

function getBoundingBox(
  center: { lat: number; lng: number },
  radiusKm: number
) {
  const lat = center.lat;
  const lon = center.lng;
  const R = 6371; // Earth radius in km

  const dLat = (radiusKm / R) * (180 / Math.PI);
  const dLon =
    ((radiusKm / R) * (180 / Math.PI)) / Math.cos((lat * Math.PI) / 180);

  const swLat = lat - dLat;
  const swLon = lon - dLon;
  const neLat = lat + dLat;
  const neLon = lon + dLon;

  return `${swLon},${swLat},${neLon},${neLat}`;
}

export default function LiveChokepointsDashboard({
  center,
  onChokepointSelect,
}: {
  center: { lat: number; lng: number };
  onChokepointSelect: (location: { lat: number; lon: number } | null) => void;
}) {
  const [radius, setRadius] = useState(1); // in km
  const bbox = getBoundingBox(center, radius);

  return (
    <div className="pt-4 h-full flex flex-col">
      <div className="mb-4 px-4">
        <label
          htmlFor="radius-slider"
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Search Radius: <span className="font-semibold">{radius} km</span>
        </label>
        <input
          id="radius-slider"
          type="range"
          min="1"
          max="20"
          step="1"
          value={radius}
          onChange={(e) => setRadius(Number(e.target.value))}
          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
        />
      </div>
      <div className="flex-grow overflow-y-auto px-4 pb-4">
        <LiveLeaderboard bbox={bbox} onChokepointSelect={onChokepointSelect} />
      </div>
    </div>
  );
}
