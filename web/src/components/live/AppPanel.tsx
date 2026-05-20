import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type AppLog } from "@/integrations/supabase/live";

type Props = {
  current?: AppLog;
  recent: AppLog[];
};

export function AppPanel({ current, recent }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>App Detection</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div>
            <div className="text-sm text-muted-foreground">Current</div>
            <div className="font-medium truncate">
              {current ? `${current.app_name} ${current.window_title ? `— ${current.window_title}` : ""}` : "—"}
            </div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-1">Recent</div>
            <div className="space-y-1">
              {recent.slice(0, 10).map((a) => (
                <div key={a.id} className="text-sm text-muted-foreground truncate">
                  {new Date(a.ts).toLocaleTimeString()} · {a.app_name}
                </div>
              ))}
              {recent.length === 0 && <div className="text-sm text-muted-foreground">No app logs</div>}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default AppPanel;


