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

// Removed historical analytics components; focusing on live chokepoints only
import { ChokepointDashboard } from "../chokepoints/Dashboard";

interface AnalyticsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  selectedArea?: {
    bbox: [number, number, number, number];
    name?: string;
  };
}

type AnalyticsTab = "chokepoints";

interface DatePreset {
  label: string;
  range: DateRange;
  key: string;
}

export function AnalyticsPanel({ isOpen, onClose, selectedArea }: AnalyticsPanelProps) {
  const [activeTab, setActiveTab] = useState<AnalyticsTab>("chokepoints");
  const [dateRange, setDateRange] = useState<DateRange>(() => {
    const today = new Date();
    return {
      from: startOfDay(subDays(today, 7)),
      to: endOfDay(today)
    };
  });
  const [isLoading, setIsLoading] = useState(false);

  const datePresets: DatePreset[] = [];

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
          <div className="text-sm text-muted-foreground">Live chokepoints (no date range needed)</div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b">
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