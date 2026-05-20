import React, { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmployeeSelect } from "@/components/live/EmployeeSelect";
import { TodayChips } from "@/components/live/TodayChips";
import { ScreenshotStream } from "@/components/live/ScreenshotStream";
import { LiveStatusCard } from "@/components/live/LiveStatusCard";
import { AppPanel } from "@/components/live/AppPanel";
import { UrlPanel } from "@/components/live/UrlPanel";
import { ActivityMiniChart } from "@/components/live/ActivityMiniChart";
import { useTodayWindow } from "@/hooks/live/useTodayWindow";
import { useEmployeePicker } from "@/hooks/live/useEmployeePicker";
import { useLiveTracking } from "@/hooks/live/useLiveTracking";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/providers/auth-provider";

export default function LiveTrackingTodayPage() {
  const { userDetails, isSuperAdmin } = useAuth();
  const organizationId = userDetails?.organization_id;
  const { fromISO, tz } = useTodayWindow();
  const { search, setSearch, selected, setSelected, results, loading: searching } = useEmployeePicker(organizationId, isSuperAdmin);
  const live = useLiveTracking(selected?.id, fromISO);
  
  // Toggle for enabling Monitoring section in sidebar (hidden by default)
  const readFlag = useCallback(() => {
    if (typeof window === 'undefined') return false;
    const v = window.localStorage.getItem('tf_monitoring_enabled');
    return v === '1' || v === 'true';
  }, []);
  const [monitoringEnabled, setMonitoringEnabled] = useState<boolean>(readFlag());
  useEffect(() => {
    setMonitoringEnabled(readFlag());
  }, [readFlag]);
  const onToggleMonitoring = useCallback(async (checked: boolean) => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('tf_monitoring_enabled', checked ? '1' : '0');
    // Notify other components (like Sidebar) within the same tab
    window.dispatchEvent(new Event('tf-monitoring-visibility-changed'));
    setMonitoringEnabled(checked);

    // Broadcast to desktop agents listening on realtime channel
    try {
      await supabase
        .channel('tf_settings')
        .send({
          type: 'broadcast',
          event: 'monitoring_visibility',
          payload: { enabled: checked }
        });
    } catch (e) {
      console.error('[live-tracking] Failed to broadcast monitoring visibility', e);
    }
  }, []);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Live Tracking (Today)</h1>
        <p className="text-muted-foreground">Pick an employee to watch live.</p>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <Card>
          <CardContent className="p-4 flex flex-col gap-3">
            <div className="flex flex-col lg:flex-row gap-4 lg:items-center justify-between">
              <EmployeeSelect
                value={selected}
                onChange={setSelected}
                search={search}
                onSearch={setSearch}
                options={results}
                loading={searching}
              />
              <div className="flex items-center gap-3">
                <Switch id="toggle-monitoring-menu" checked={monitoringEnabled} onCheckedChange={onToggleMonitoring} />
                <Label htmlFor="toggle-monitoring-menu" className="text-sm text-muted-foreground">
                  {monitoringEnabled ? 'Monitoring menu enabled' : 'Enable Monitoring menu'}
                </Label>
              </div>
              <TodayChips
                isIdle={live.isIdle}
                workedToday={live.workedToday}
                lastScreenshotAt={live.lastScreenshotAt || null}
                tz={tz}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {!selected ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">Select an employee to start live monitoring.</CardContent>
        </Card>
      ) : live.loading ? (
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 lg:col-span-8 space-y-3">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-48 w-full" />
          </div>
          <div className="col-span-12 lg:col-span-4 space-y-3">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
          <div className="col-span-12 space-y-3">
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 lg:col-span-8">
            <Card>
              <CardHeader>
                <CardTitle>Screenshot Stream</CardTitle>
              </CardHeader>
              <CardContent>
                <ScreenshotStream screenshots={live.screenshots} />
              </CardContent>
            </Card>
          </div>

          <div className="col-span-12 lg:col-span-4 space-y-4">
            <LiveStatusCard isIdle={live.isIdle} lastInputAgo={live.lastInputAgo} idleSeconds={live.idleSeconds} />
            <AppPanel current={live.currentApp} recent={live.recentApps} />
            <UrlPanel current={live.currentUrl} recent={live.recentUrls} />
          </div>

          <div className="col-span-12">
            <ActivityMiniChart activity={live.activity || []} fromISO={fromISO} />
          </div>
        </div>
      )}
    </div>
  );
}


