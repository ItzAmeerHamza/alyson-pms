import * as React from "react";
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { addDays, format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subWeeks, addWeeks, subMonths, addMonths } from "date-fns";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface DateRangePickerProps {
  onDateRangeChange: (start: Date, end: Date) => void;
  defaultRange?: string;
  showNavigation?: boolean;
  showPresets?: boolean;
  className?: string;
}

const presetRanges = [
  {
    label: "Today",
    value: "today",
    getRange: () => {
      const today = new Date();
      return { start: today, end: today };
    }
  },
  {
    label: "Yesterday", 
    value: "yesterday",
    getRange: () => {
      const yesterday = addDays(new Date(), -1);
      return { start: yesterday, end: yesterday };
    }
  },
  {
    label: "This Week",
    value: "thisWeek",
    getRange: () => {
      const today = new Date();
      return {
        start: startOfWeek(today, { weekStartsOn: 0 }),
        end: endOfWeek(today, { weekStartsOn: 0 })
      };
    }
  },
  {
    label: "Last Week",
    value: "lastWeek", 
    getRange: () => {
      const today = new Date();
      const lastWeek = subWeeks(today, 1);
      return {
        start: startOfWeek(lastWeek, { weekStartsOn: 0 }),
        end: endOfWeek(lastWeek, { weekStartsOn: 0 })
      };
    }
  },
  {
    label: "This Month",
    value: "thisMonth",
    getRange: () => {
      const today = new Date();
      return {
        start: startOfMonth(today),
        end: endOfMonth(today)
      };
    }
  },
  {
    label: "Last Month",
    value: "lastMonth",
    getRange: () => {
      const today = new Date();
      const lastMonth = subMonths(today, 1);
      return {
        start: startOfMonth(lastMonth),
        end: endOfMonth(lastMonth)
      };
    }
  },
  {
    label: "Last 7 Days",
    value: "last7Days",
    getRange: () => {
      const today = new Date();
      return {
        start: addDays(today, -6),
        end: today
      };
    }
  },
  {
    label: "Last 30 Days",
    value: "last30Days",
    getRange: () => {
      const today = new Date();
      return {
        start: addDays(today, -29),
        end: today
      };
    }
  }
];

export function DateRangePicker({
  onDateRangeChange,
  defaultRange = "thisWeek",
  showNavigation = true,
  showPresets = true,
  className
}: DateRangePickerProps) {
  const [selectedPreset, setSelectedPreset] = React.useState<string>(defaultRange);
  const [dateRange, setDateRange] = React.useState<{start: Date, end: Date} | null>(null);
  const [customStartDate, setCustomStartDate] = React.useState<Date>();
  const [customEndDate, setCustomEndDate] = React.useState<Date>();

  // Initialize with default range
  React.useEffect(() => {
    const preset = presetRanges.find(p => p.value === defaultRange);
    if (preset) {
      const range = preset.getRange();
      setDateRange(range);
      onDateRangeChange(range.start, range.end);
    }
  }, [defaultRange, onDateRangeChange]);

  const handlePresetChange = (presetValue: string) => {
    setSelectedPreset(presetValue);
    
    if (presetValue === "custom") {
      return; // Let user select custom dates
    }

    const preset = presetRanges.find(p => p.value === presetValue);
    if (preset) {
      const range = preset.getRange();
      setDateRange(range);
      onDateRangeChange(range.start, range.end);
    }
  };

  const handleCustomDateSelection = (startDate?: Date, endDate?: Date) => {
    if (startDate) {
      setCustomStartDate(startDate);
    }
    if (endDate) {
      setCustomEndDate(endDate);
    }

    if (startDate && endDate && startDate <= endDate) {
      const range = { start: startDate, end: endDate };
      setDateRange(range);
      onDateRangeChange(range.start, range.end);
    }
  };

  const navigateRange = (direction: 'prev' | 'next') => {
    if (!dateRange) return;

    let newRange: { start: Date, end: Date };
    const daysDiff = Math.ceil((dateRange.end.getTime() - dateRange.start.getTime()) / (1000 * 60 * 60 * 24));

    if (direction === 'prev') {
      newRange = {
        start: addDays(dateRange.start, -daysDiff - 1),
        end: addDays(dateRange.end, -daysDiff - 1)
      };
    } else {
      newRange = {
        start: addDays(dateRange.start, daysDiff + 1),
        end: addDays(dateRange.end, daysDiff + 1)
      };
    }

    setDateRange(newRange);
    onDateRangeChange(newRange.start, newRange.end);
    setSelectedPreset("custom"); // Switch to custom when navigating
  };

  const formatDateRange = () => {
    if (!dateRange) return "Select date range";
    
    if (dateRange.start.toDateString() === dateRange.end.toDateString()) {
      return format(dateRange.start, "MMM d, yyyy");
    }
    
    return `${format(dateRange.start, "MMM d")} - ${format(dateRange.end, "MMM d, yyyy")}`;
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {/* Preset Selection */}
      {showPresets && (
        <div className="flex items-center gap-2">
          <Label className="text-sm font-medium">Period:</Label>
          <Select value={selectedPreset} onValueChange={handlePresetChange}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {presetRanges.map((preset) => (
                <SelectItem key={preset.value} value={preset.value}>
                  {preset.label}
                </SelectItem>
              ))}
              <SelectItem value="custom">Custom Range</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Navigation Buttons */}
      {showNavigation && dateRange && (
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigateRange('prev')}
            className="h-8 w-8 p-0"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigateRange('next')}
            className="h-8 w-8 p-0"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Date Range Display / Custom Picker */}
      <div className="flex items-center gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "justify-start text-left font-normal",
                !dateRange && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {formatDateRange()}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            {selectedPreset === "custom" ? (
              <div className="p-4 space-y-4">
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <Calendar
                    mode="single"
                    selected={customStartDate}
                    onSelect={(date) => handleCustomDateSelection(date, customEndDate)}
                    initialFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label>End Date</Label>
                  <Calendar
                    mode="single"
                    selected={customEndDate}
                    onSelect={(date) => handleCustomDateSelection(customStartDate, date)}
                    disabled={(date) =>
                      customStartDate ? date < customStartDate : false
                    }
                  />
                </div>
              </div>
            ) : (
              <div className="p-4">
                <div className="space-y-2">
                  <h4 className="font-medium">Quick Select</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {presetRanges.slice(0, 6).map((preset) => (
                      <Button
                        key={preset.value}
                        variant={selectedPreset === preset.value ? "default" : "outline"}
                        size="sm"
                        onClick={() => handlePresetChange(preset.value)}
                        className="text-xs"
                      >
                        {preset.label}
                      </Button>
                    ))}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePresetChange("custom")}
                    className="w-full text-xs mt-2"
                  >
                    Custom Range
                  </Button>
                </div>
              </div>
            )}
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
} 