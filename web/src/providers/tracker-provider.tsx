
import React, { createContext, useContext, useState, useEffect } from 'react';

interface TrackerContextType {
  isTracking: boolean;
  currentProjectId: string | null;
  startTracking: (projectId: string) => void;
  stopTracking: () => void;
  canTrack: boolean;
}

const TrackerContext = createContext<TrackerContextType | undefined>(undefined);

export function TrackerProvider({ children }: { children: React.ReactNode }) {
  const [isTracking, setIsTracking] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [canTrack] = useState(false); // Desktop tracking capability

  // Check if we're in desktop app
  useEffect(() => {
    // In a real implementation, this would check for Electron environment
    // For now, we'll simulate desktop app detection
    const isDesktop = window.navigator.userAgent.includes('Electron');
    if (isDesktop) {
      // Would enable tracking for desktop app
    }
  }, []);

  const startTracking = (projectId: string) => {
    setCurrentProjectId(projectId);
    setIsTracking(true);
    // In desktop app, this would communicate with the main process
    console.log('Started tracking project:', projectId);
  };

  const stopTracking = () => {
    setIsTracking(false);
    setCurrentProjectId(null);
    // In desktop app, this would communicate with the main process
    console.log('Stopped tracking');
  };

  return (
    <TrackerContext.Provider value={{
      isTracking,
      currentProjectId,
      startTracking,
      stopTracking,
      canTrack,
    }}>
      {children}
    </TrackerContext.Provider>
  );
}

export function useTracker() {
  const context = useContext(TrackerContext);
  if (context === undefined) {
    throw new Error('useTracker must be used within a TrackerProvider');
  }
  return context;
}
