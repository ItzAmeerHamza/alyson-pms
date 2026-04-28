import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  isIdle: boolean;
  lastInputAgo: number | null; // minutes
  idleSeconds?: number; // optional total idle seconds today
};

export function LiveStatusCard({ isIdle, lastInputAgo, idleSeconds }: Props) {
  const idleHhMm = idleSeconds != null ? toHHMM(idleSeconds) : null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Live Status</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div>
            <div className="text-sm text-muted-foreground">State</div>
            <div className={isIdle ? "text-amber-600 font-medium" : "text-emerald-600 font-medium"}>
              {isIdle ? "Idle" : "Active"}
            </div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Last input</div>
            <div className="font-medium">{lastInputAgo === null ? "—" : `${lastInputAgo} min ago`}</div>
          </div>
          {idleHhMm && (
            <div>
              <div className="text-sm text-muted-foreground">Idle Today</div>
              <div className="font-medium">{idleHhMm}</div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default LiveStatusCard;

function toHHMM(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}


