"use client";

import { useState } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { DateRange } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DateRangeSelectorProps {
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange | undefined) => void;
  maxRange?: number; // Maximum number of days allowed
  className?: string;
}

export function DateRangeSelector({
  dateRange,
  onDateRangeChange,
  maxRange = 90,
  className
}: DateRangeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleDateSelect = (range: DateRange | undefined) => {
    if (range?.from && range?.to) {
      const daysDiff = Math.ceil(
        (range.to.getTime() - range.from.getTime()) / (1000 * 60 * 60 * 24)
      );
      
      if (daysDiff > maxRange) {
        // Don't allow ranges longer than maxRange days
        return;
      }
    }
    
    onDateRangeChange(range);
    
    // Close popover when both dates are selected
    if (range?.from && range?.to) {
      setIsOpen(false);
    }
  };

  const formatDateRange = () => {
    if (dateRange?.from) {
      if (dateRange.to) {
        return `${format(dateRange.from, "LLL dd, y")} - ${format(dateRange.to, "LLL dd, y")}`;
      }
      return format(dateRange.from, "LLL dd, y");
    }
    return "Select date range";
  };

  const getDaysCount = () => {
    if (dateRange?.from && dateRange?.to) {
      const days = Math.ceil(
        (dateRange.to.getTime() - dateRange.from.getTime()) / (1000 * 60 * 60 * 24)
      );
      return days + 1; // Include both start and end days
    }
    return 0;
  };

  return (
    <div className={cn("grid gap-2", className)}>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant="outline"
            className={cn(
              "w-full justify-start text-left font-normal",
              !dateRange && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {formatDateRange()}
            {getDaysCount() > 0 && (
              <span className="ml-auto text-xs text-muted-foreground">
                ({getDaysCount()} days)
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={dateRange?.from}
            selected={dateRange}
            onSelect={handleDateSelect}
            numberOfMonths={2}
            disabled={(date) => {
              // Disable future dates
              if (date > new Date()) return true;
              
              // If we have a from date, disable dates that would create a range > maxRange
              if (dateRange?.from && !dateRange?.to) {
                const daysDiff = Math.abs(
                  Math.ceil((date.getTime() - dateRange.from.getTime()) / (1000 * 60 * 60 * 24))
                );
                if (daysDiff > maxRange) return true;
              }
              
              return false;
            }}
          />
          {getDaysCount() > maxRange && (
            <div className="p-3 border-t">
              <p className="text-xs text-destructive">
                Maximum range is {maxRange} days. Please select a shorter period.
              </p>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}