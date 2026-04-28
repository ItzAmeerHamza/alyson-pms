
interface ElectronAPI {
  setUserId: (id: string) => void;
  setProjectId: (id: string) => void;
  startTracking: () => void;
  stopTracking: () => void;
  syncOfflineData: () => void;
  loadSession: () => Promise<{
    project_id: string;
    user_id: string;
    start_time: string;
    time_log_id: string;
    end_time?: string;
  } | null>;
  clearSavedSession: () => void;
  // Add invoke method for IPC communication
  invoke?: (channel: string, ...args: any[]) => Promise<any>;
  // Add event listener methods
  on?: (channel: string, listener: (event: any, ...args: any[]) => void) => void;
  removeAllListeners?: (channel: string) => void;
}

interface Window {
  electron?: ElectronAPI;
  isElectron?: boolean;
}
