import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchTodaySnapshot,
  subscribeLiveToday,
  type Screenshot,
  type AppLog,
  type UrlLog,
  type ActivityLog,
} from "@/integrations/supabase/live";

function formatHHMM(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function useLiveTracking(employeeId: string | undefined, fromISO: string) {
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [recentApps, setRecentApps] = useState<AppLog[]>([]);
  const [recentUrls, setRecentUrls] = useState<UrlLog[]>([]);
  const [currentApp, setCurrentApp] = useState<AppLog | undefined>(undefined);
  const [currentUrl, setCurrentUrl] = useState<UrlLog | undefined>(undefined);
  const [activity, setActivity] = useState<ActivityLog[]>([]);
  const [isIdle, setIsIdle] = useState<boolean>(false);
  const [workedSeconds, setWorkedSeconds] = useState<number>(0);
  const [idleSeconds, setIdleSeconds] = useState<number>(0);

  const { data, isLoading, isError, refetch } = useQuery({
    enabled: !!employeeId,
    queryKey: ["live-snapshot", employeeId, fromISO],
    queryFn: async () => {
      if (!employeeId) return null;
      return fetchTodaySnapshot(employeeId, fromISO);
    },
    refetchOnWindowFocus: false,
  });

  // Initialize state when snapshot loads
  useEffect(() => {
    if (!data) return;
    console.log('🔍 [DEBUG] Live tracking data received:', data);
    setScreenshots(data.screenshots);
    setRecentApps(data.apps);
    setRecentUrls(data.urls);
    setCurrentApp(data.currentApp);
    setCurrentUrl(data.currentUrl);
    setActivity(data.activity);
    setIsIdle(data.isIdle);
    setWorkedSeconds(data.workedSeconds);
    if (typeof (data as any).idleSeconds === "number") setIdleSeconds((data as any).idleSeconds);
  }, [data]);

  // Setup realtime
  const unsubscribeRef = useRef<() => void>();
  useEffect(() => {
    if (!employeeId) return;
    unsubscribeRef.current?.();
    const unsub = subscribeLiveToday(employeeId, fromISO, {
      onScreenshot: (row) => {
        setScreenshots((prev) => [row, ...prev].slice(0, 100));
      },
      onApp: (row) => {
        setCurrentApp(row);
        setRecentApps((prev) => [row, ...prev].slice(0, 10));
      },
      onUrl: (row) => {
        setCurrentUrl(row);
        setRecentUrls((prev) => [row, ...prev].slice(0, 10));
      },
      onActivity: (row) => {
        setActivity((prev) => [row, ...prev].slice(0, 500));
        if (typeof row.is_idle === "boolean") setIsIdle(row.is_idle);
      },
      onTimeLogChange: () => {
        // re-fetch summary when time logs change
        refetch();
      },
    });
    unsubscribeRef.current = unsub;
    return () => unsub();
  }, [employeeId, fromISO, refetch]);

  // Ticker to update workedSeconds for an ongoing segment
  useEffect(() => {
    if (!employeeId) return;
    const id = setInterval(() => refetch(), 30_000);
    return () => clearInterval(id);
  }, [employeeId, refetch]);

  const lastScreenshotAt = useMemo(() => screenshots[0]?.taken_at ?? null, [screenshots]);
  const lastInputAgo = useMemo(() => {
    const latest = activity[0];
    if (!latest) return null;
    const diffMs = Date.now() - new Date(latest.ts).getTime();
    const minutes = Math.max(0, Math.floor(diffMs / 60_000));
    return minutes;
  }, [activity]);

  const workedTodayHHMM = useMemo(() => formatHHMM(workedSeconds), [workedSeconds]);

  return {
    loading: isLoading,
    error: isError ? "Failed to load" : null,
    screenshots,
    currentApp,
    recentApps,
    currentUrl,
    recentUrls,
    activity,
    isIdle,
    lastInputAgo,
    workedToday: workedTodayHHMM,
    lastScreenshotAt,
    idleSeconds,
  };
}

export type UseLiveTracking = ReturnType<typeof useLiveTracking>;


