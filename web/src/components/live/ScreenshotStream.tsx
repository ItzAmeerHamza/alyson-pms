import React, { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { type Screenshot } from "@/integrations/supabase/live";
import { getSignedScreenshotURL } from "@/integrations/supabase/live";

type Props = {
  screenshots: Screenshot[];
};

export function ScreenshotStream({ screenshots }: Props) {
  const limited = useMemo(() => screenshots.slice(0, 100), [screenshots]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-3">
      {limited.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">No screenshots yet today</Card>
      ) : (
        limited.map((shot) => <ShotItem key={shot.id} shot={shot} />)
      )}
    </div>
  );
}

function ShotItem({ shot }: { shot: Screenshot }) {
  const [url, setUrl] = React.useState<string>("");
  React.useEffect(() => {
    let mounted = true;
    getSignedScreenshotURL(shot.storage_path).then((u) => mounted && setUrl(u)).catch(() => {});
    return () => {
      mounted = false;
    };
  }, [shot.storage_path]);

  return (
    <div className="relative group overflow-hidden rounded-md border">
      <img
        src={url}
        alt={new Date(shot.taken_at).toLocaleString()}
        loading="lazy"
        sizes="(max-width: 768px) 100vw, 33vw"
        className="w-full h-48 object-cover transition-transform duration-300 group-hover:scale-105"
      />
      <div className="absolute top-2 right-2 flex gap-1">
        {typeof shot.activity_score === "number" && (
          <span className="px-2 py-0.5 text-xs rounded-full bg-black/70 text-white">{Math.round(shot.activity_score)}%</span>
        )}
        {(shot.keystrokes || shot.mouse_clicks || shot.mouse_movements) && (
          <span className="px-2 py-0.5 text-xs rounded-full bg-blue-600 text-white">
            {shot.keystrokes ?? 0}k/{shot.mouse_clicks ?? 0}c/{shot.mouse_movements ?? 0}m
          </span>
        )}
        {shot.risk_score && shot.risk_score > 0 && (
          <span className="px-2 py-0.5 text-xs rounded-full bg-red-600 text-white">risk {shot.risk_score}</span>
        )}
        {shot.duplicate_flag && (
          <span className="px-2 py-0.5 text-xs rounded-full bg-slate-600 text-white">dup</span>
        )}
      </div>
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2 text-xs text-white">
        {new Date(shot.taken_at).toLocaleTimeString()}
      </div>
    </div>
  );
}

export default ScreenshotStream;


