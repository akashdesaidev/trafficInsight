"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { RefreshCw } from "lucide-react";

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
}

export default function LiveLeaderboard({ selectedArea }: Props) {
  const [clusters, setClusters] = useState<LiveCluster[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  const fetchLive = async () => {
    setLoading(true);
    setError(null);

    // Create AbortController with 90-second timeout to handle slow backend processing
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90000);

    try {
      // Backend now defaults to Bangalore; no bbox required
      const url = `/api/traffic/live-chokepoints?z=14&eps_m=400&min_samples=3&jf_min=2&include_geocode=true`;
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
      setClusters(Array.isArray(data?.clusters) ? data.clusters : []);
    } catch (e) {
      clearTimeout(timeoutId);
      if (e instanceof Error && e.name === "AbortError") {
        setError(
          "Request timed out - backend processing takes >90s. Try reducing parameters or check server logs."
        );
      } else {
        setError(
          e instanceof Error ? e.message : "Failed to load live chokepoints"
        );
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

  const ranked = useMemo(
    () => clusters.slice().sort((a, b) => b.score - a.score),
    [clusters]
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Live Choke Points (Realtime)</CardTitle>
        {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
      </CardHeader>
      <CardContent>
        {error ? <div className="text-sm text-red-600">{error}</div> : null}
        <ScrollArea className="h-[320px]">
          <div className="space-y-3">
            {ranked.map((c, idx) => (
              <div
                key={c.id}
                className="flex items-center justify-between p-4 border rounded-lg"
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
                      {c.road_name
                        ? `${c.road_name}`
                        : `Score: ${c.score.toFixed(1)}`}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Score: {c.score.toFixed(1)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Mean: {(c.severity_mean * 100).toFixed(0)}% • Peak:{" "}
                      {(c.severity_peak * 100).toFixed(0)}% • Points: {c.count}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Center: {c.center.lat.toFixed(5)},{" "}
                      {c.center.lon.toFixed(5)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {c.incident_count > 0 ? (
                    <Badge className="bg-orange-100 text-orange-800">
                      Incidents: {c.incident_count}
                    </Badge>
                  ) : null}
                  {c.closure ? (
                    <Badge className="bg-purple-100 text-purple-800">
                      Closure
                    </Badge>
                  ) : null}
                </div>
              </div>
            ))}
            {ranked.length === 0 && !loading ? (
              <div className="text-center py-8 text-muted-foreground">
                No live choke points detected.
              </div>
            ) : null}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
