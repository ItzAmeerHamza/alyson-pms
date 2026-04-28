import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type ActivityLog } from "@/integrations/supabase/live";

type Props = {
  activity: ActivityLog[];
  fromISO: string;
};

export function ActivityMiniChart({ activity, fromISO }: Props) {
  // Build a simple per-minute count from fromISO to now
  const data = useMemo(() => {
    const start = new Date(fromISO).getTime();
    const end = Date.now();
    const minutes = Math.max(1, Math.ceil((end - start) / 60000));
    const buckets = new Array<number>(minutes).fill(0);

    for (const a of activity) {
      const idx = Math.floor((new Date(a.ts).getTime() - start) / 60000);
      if (idx >= 0 && idx < buckets.length) buckets[idx] += a.is_idle ? 0 : 1;
    }
    return buckets.slice(-120); // last 120 minutes
  }, [activity, fromISO]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity Timeline – Today</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-0.5 h-24">
          {data.map((v, i) => (
            <div key={i} className="w-1 bg-emerald-500" style={{ height: `${Math.min(100, v * 10)}%` }} />
          ))}
          {data.length === 0 && <div className="text-sm text-muted-foreground">No activity yet</div>}
        </div>
      </CardContent>
    </Card>
  );
}

export default ActivityMiniChart;


