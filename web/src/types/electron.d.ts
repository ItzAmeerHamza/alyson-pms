interface ElectronAPI {
  setUserId: (id: string) => void;
  startTracking: () => void;
  stopTracking: () => void;
  syncOfflineData: () => void;
  loadSession: () => Promise<any>;
  clearSession: () => void;
  send: (channel: string, ...args: any[]) => void;
  invoke: (channel: string, ...args: any[]) => Promise<any>;
  
  // App information
  appVersion?: string;
  
  // Automated release trigger
  triggerAutomatedRelease?: (failureReport: {
    timestamp: string;
    failedFeatures: string[];
    failureHistory: Record<string, number>;
    errorDetails: Record<string, string>;
    userAgent: string;
    appVersion: string;
  }) => Promise<void>;
  
  // Activity monitoring methods
  getActivityStats?: () => Promise<{
    mouseClicks: number;
    keystrokes: number;
    mouseMovements: number;
    idleSeconds: number;
    activeSeconds: number;
    suspiciousEvents: number;
    riskScore: number;
    screenshotsCaptured: number;
  }>;
  
  getAntiCheatReport?: () => Promise<{
    isMonitoring: boolean;
    totalSuspiciousEvents: number;
    recentActivity: any[];
    currentRiskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  }>;
  
  // Event listeners
  onActivityStatsUpdate?: (callback: (stats: any) => void) => void;
  onIdleStatusChange?: (callback: (status: any) => void) => void;
  onScreenshotCaptured?: (callback: (screenshot: any) => void) => void;

  // Health Check APIs for Timer Pre-flight Checks
  screenshots?: {
    testCapability: () => Promise<{ success: boolean; error?: string }>;
  };
  
  urlTracker?: {
    testDetection: () => Promise<{ success: boolean; error?: string }>;
  };
  
  appTracker?: {
    testDetection: () => Promise<{ 
      success: boolean; 
      error?: string; 
      detectedApps?: string[] 
    }>;
  };
  
  fraudDetector?: {
    testSystem: () => Promise<{ success: boolean; error?: string }>;
  };
  
  database?: {
    testConnection: (testData: any) => Promise<{ success: boolean; error?: string }>;
  };

  // URL Detection APIs
  'get-current-url'?: () => Promise<{
    url: string;
    title?: string;
    browser?: string;
    timestamp?: string;
  }>;
  
  'test-url-detection'?: () => Promise<{
    success: boolean;
    url?: string;
    error?: string;
  }>;
  
  'test-app-detection'?: () => Promise<{
    success: boolean;
    app?: string;
    error?: string;
  }>;
}

declare global {
  interface Window {
    electron?: ElectronAPI;
  }
}

interface ScreenshotMeta {
  user_id: string;
  image_url: string;
  captured_at: string;
} 
