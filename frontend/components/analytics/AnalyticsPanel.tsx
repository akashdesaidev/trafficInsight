"use client";

import { useState, useEffect } from "react";
import { Calendar, BarChart3, TrendingUp, Clock, X, ChevronRight } from "lucide-react";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { DateRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

import { DateRangeSelector } from "./DateRangeSelector";
import { TrafficPatternCharts } from "./TrafficPatternCharts";
import { TrafficStatsOverview } from "./TrafficStatsOverview";
import { CongestionHeatmap } from "./CongestionHeatmap";
import { ChokepointDashboard } from "../chokepoints/Dashboard";

interface AnalyticsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  selectedArea?: {
    bbox: [number, number, number, number];
    name?: string;
  };
}

type AnalyticsTab = "overview" | "patterns" | "heatmap" | "chokepoints";

interface DatePreset {
  label: string;
  range: DateRange;
  key: string;
}

export function AnalyticsPanel({ isOpen, onClose, selectedArea }: AnalyticsPanelProps) {
  const [activeTab, setActiveTab] = useState<AnalyticsTab>("overview");
  const [dateRange, setDateRange] = useState<DateRange>(() => {
    const today = new Date();
    return {
      from: startOfDay(subDays(today, 7)),
      to: endOfDay(today)
    };
  });
  const [isLoading, setIsLoading] = useState(false);

  const datePresets: DatePreset[] = [
    {
      label: "Last 7 days",
      key: "7d",
      range: {
        from: startOfDay(subDays(new Date(), 7)),
        to: endOfDay(new Date())
      }
    },
    {
      label: "Last 30 days",
      key: "30d",
      range: {
        from: startOfDay(subDays(new Date(), 30)),
        to: endOfDay(new Date())
      }
    },
    {
      label: "Last 90 days",
      key: "90d",
      range: {
        from: startOfDay(subDays(new Date(), 90)),
        to: endOfDay(new Date())
      }
    }
  ];

  const formatDateRange = (range: DateRange) => {
    if (!range.from || !range.to) return "Select date range";
    if (range.from.getTime() === range.to.getTime()) {
      return format(range.from, "MMM d, yyyy");
    }
    return `${format(range.from, "MMM d")} - ${format(range.to, "MMM d, yyyy")}`;
  };

  const handleDateRangeChange = (newRange: DateRange | undefined) => {
    if (newRange) {
      setDateRange(newRange);
    }
  };

  const handlePresetClick = (preset: DatePreset) => {
    setDateRange(preset.range);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl bg-background border-l shadow-xl">
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            <BarChart3 className="h-5 w-5 text-primary" />
            <div>
              <h2 className="text-lg font-semibold">Traffic Analytics</h2>
              {selectedArea?.name && (
                <p className="text-sm text-muted-foreground">{selectedArea.name}</p>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Date Range Selector */}
        <div className="p-4 border-b bg-muted/30">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Time Period:</span>
            <Badge variant="secondary" className="text-xs">
              {formatDateRange(dateRange)}
            </Badge>
          </div>
          
          <div className="flex flex-wrap gap-2 mb-3">
            {datePresets.map((preset) => (
              <Button
                key={preset.key}
                variant="outline"
                size="sm"
                onClick={() => handlePresetClick(preset)}
                className="h-7 text-xs"
              >
                {preset.label}
              </Button>
            ))}
          </div>

          <DateRangeSelector
            dateRange={dateRange}
            onDateRangeChange={handleDateRangeChange}
            maxRange={90} // Maximum 90 days
          />
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b">
          <button
            onClick={() => setActiveTab("overview")}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === "overview"
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <TrendingUp className="h-4 w-4" />
            Overview
          </button>
          <button
            onClick={() => setActiveTab("patterns")}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === "patterns"
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Clock className="h-4 w-4" />
            Patterns
          </button>
          <button
            onClick={() => setActiveTab("heatmap")}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === "heatmap"
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <BarChart3 className="h-4 w-4" />
            Heatmap
          </button>
          <button
            onClick={() => setActiveTab("chokepoints")}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === "chokepoints"
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <TrendingUp className="h-4 w-4" />
            Choke Points
          </button>
        </div>

        {/* Content Area */}
        <ScrollArea className="flex-1">
          <div className="p-4">
            {isLoading && (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <span className="ml-2 text-sm text-muted-foreground">Loading analytics...</span>
              </div>
            )}

            {!isLoading && (
              <>
                {activeTab === "overview" && (
                  <TrafficStatsOverview
                    dateRange={dateRange}
                    selectedArea={selectedArea}
                    onLoadingChange={setIsLoading}
                  />
                )}

                {activeTab === "patterns" && (
                  <TrafficPatternCharts
                    dateRange={dateRange}
                    selectedArea={selectedArea}
                    onLoadingChange={setIsLoading}
                  />
                )}

                {activeTab === "heatmap" && (
                  <CongestionHeatmap
                    dateRange={dateRange}
                    selectedArea={selectedArea}
                    onLoadingChange={setIsLoading}
                  />
                )}

                {activeTab === "chokepoints" && (
                  <ChokepointDashboard
                    selectedArea={selectedArea}
                  />
                )}
              </>
            )}
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="p-4 border-t bg-muted/30">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Data updated: {format(new Date(), "MMM d, yyyy 'at' HH:mm")}
            </span>
            <div className="flex items-center gap-1">
              <span>Powered by TomTom</span>
              <ChevronRight className="h-3 w-3" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}