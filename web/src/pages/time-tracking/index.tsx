import { PageHeader } from "@/components/layout/page-header";
import TimeTracker from "./time-tracker";
import { SystemCheckDialog } from "@/components/system-check-dialog";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Settings, CheckCircle } from "lucide-react";

export default function TimeTrackingPage() {
  const [showSystemCheck, setShowSystemCheck] = useState(false);
  const [systemCheckComplete, setSystemCheckComplete] = useState(false);
  const [systemReady, setSystemReady] = useState(false);

  // Auto-complete system check (no longer needed with new simple system)
  useEffect(() => {
    // Always mark system as ready with new simplified permission system
    setSystemCheckComplete(true);
    setSystemReady(true);
    
    console.log('✅ Using simplified permission system - marking system as ready');
  }, []);

  const handleSystemCheckComplete = (allSystemsReady: boolean) => {
    setSystemCheckComplete(true);
    setSystemReady(allSystemsReady);
    setShowSystemCheck(false);
    
    // Store completion timestamp
    localStorage.setItem('timeflow_system_check', Date.now().toString());
  };

  const openDebugConsole = () => {
    if (window.electron) {
      console.log('🔬 Opening debug console...');
      // Could add IPC call to open debug console if implemented
    } else {
      console.log('🔬 Debug console only available in desktop app');
    }
  };

  return (
    <div className="container py-6">
      <PageHeader
        title="Time Tracking"
        subtitle="Track time spent on tasks and projects"
      />

      {/* Simple Info Banner - New Simplified System */}
      <Alert className="mt-6 border-green-500 bg-green-50">
        <CheckCircle className="h-4 w-4" />
        <AlertDescription>
          <div>
            <strong>✅ Ready to Track</strong>
            <p className="text-sm mt-1">
              Select a project and start tracking. Permissions will be handled automatically as needed.
            </p>
          </div>
        </AlertDescription>
      </Alert>

      <div className="mt-6">
        <TimeTracker />
      </div>

      {/* Old System Check Dialog Disabled - Using New Simple Permission System */}
      {/* SystemCheckDialog has been replaced with simplePermissionDialog.ts in electron/main.ts */}
    </div>
  );
}
