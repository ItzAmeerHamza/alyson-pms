import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { type UrlLog } from "@/integrations/supabase/live";

type Props = {
  current?: UrlLog;
  recent: UrlLog[];
};

export function UrlPanel({ current, recent }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>URL Detection</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div>
            <div className="text-sm text-muted-foreground">Current</div>
            <div className="font-medium truncate">
              {current ? `${current.domain || current.url} ${current.title ? `— ${current.title}` : ""}` : "—"}
            </div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-1">Recent</div>
            <div className="space-y-1">
              {recent.slice(0, 10).map((u) => (
                <div key={u.id} className="text-sm text-muted-foreground truncate">
                  {new Date(u.ts).toLocaleTimeString()} · {u.domain || u.url}
                </div>
              ))}
              {recent.length === 0 && <div className="text-sm text-muted-foreground">No URL logs</div>}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default UrlPanel;


