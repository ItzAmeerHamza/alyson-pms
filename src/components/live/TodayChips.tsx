import React from "react";
import { Badge } from "@/components/ui/badge";

type Props = {
  isIdle: boolean;
  workedToday: string; // HH:MM
  lastScreenshotAt: string | null | undefined;
  tz: string;
};

export function TodayChips({ isIdle, workedToday, lastScreenshotAt, tz }: Props) {
  return (
    <div className="flex flex-wrap gap-2 items-center">
      <Badge variant={isIdle ? "secondary" : "default"} className={isIdle ? "bg-amber-100 text-amber-700" : "bg-emerald-600"}>
        {isIdle ? "Idle" : "Active"}
      </Badge>
      <Badge variant="outline">Worked Today: {workedToday}</Badge>
      <Badge variant="outline">
        Last Screenshot: {lastScreenshotAt ? new Date(lastScreenshotAt).toLocaleTimeString() : "—"}
      </Badge>
      <span className="text-xs text-muted-foreground ml-2">Timezone: {tz}</span>
    </div>
  );
}

export default TodayChips;


