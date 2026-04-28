// ================================
// TimeFlow Desktop Agent - Optimized Intervals Configuration
// ================================

module.exports = {
  // Feature flag to enable/disable optimized intervals
  enabled: process.env.USE_OPTIMIZED_INTERVALS !== 'false', // Default to true
  
  // Activity level thresholds (milliseconds)
  activityThresholds: {
    high: 30000,     // < 30 seconds since last activity
    medium: 120000,  // < 2 minutes since last activity  
    low: 300000,     // < 5 minutes since last activity
    // Anything beyond low is considered idle
  },
  
  // Adaptive interval configurations
  intervals: {
    // Master activity monitor - fixed interval
    masterActivity: 10000, // 10 seconds
    
    // Combined input monitor - adaptive based on activity
    input: {
      high: 5000,      // 5 seconds when highly active
      medium: 15000,   // 15 seconds when medium activity
      low: 30000,      // 30 seconds when low activity
      idle: 60000      // 60 seconds when idle
    },
    
    // Combined app/URL monitor - adaptive based on activity
    app: {
      high: 10000,     // 10 seconds when highly active
      medium: 30000,   // 30 seconds when medium activity
      low: 60000,      // 60 seconds when low activity
      idle: 120000     // 2 minutes when idle
    },
    
    // Low frequency operations - fixed interval
    lowFrequency: 60000,    // 60 seconds
    
    // Batch flush interval - fixed
    batchFlush: 30000,      // 30 seconds
    
    // Resource monitoring - fixed
    resourceMonitor: 30000  // 30 seconds
  },
  
  // Resource usage thresholds for auto-adjustment
  resourceThresholds: {
    cpu: {
      high: 80,    // Switch to ultra performance mode above 80%
      medium: 60   // Consider reducing intervals above 60%
    },
    memory: {
      high: 85,    // Switch to ultra performance mode above 85%
      medium: 70   // Consider reducing intervals above 70%
    }
  },
  
  // Screenshot probability based on activity level
  screenshotProbability: {
    high: 0.8,     // 80% chance when highly active
    medium: 0.5,   // 50% chance when medium activity
    low: 0.2,      // 20% chance when low activity
    idle: 0.05     // 5% chance when idle
  },
  
  // Batch processing configuration
  batch: {
    maxSize: 100,         // Maximum items per batch
    forceFlushSize: 50,   // Force flush if batch reaches this size
    maxAge: 60000         // Force flush if oldest item is older than 1 minute
  },
  
  // Performance modes
  performanceModes: {
    normal: {
      description: 'Standard monitoring with balanced resource usage',
      multiplier: 1.0
    },
    high_performance: {
      description: 'Reduced monitoring frequency for better performance',
      multiplier: 2.0  // Double all intervals
    },
    ultra_performance: {
      description: 'Minimal monitoring for low-end systems',
      multiplier: 3.0  // Triple all intervals
    },
    aggressive: {
      description: 'Maximum monitoring frequency (testing only)',
      multiplier: 0.5  // Half all intervals
    }
  },
  
  // Debug settings
  debug: {
    logIntervalAdjustments: true,
    logBatchOperations: true,
    logResourceUsage: true,
    logActivityChanges: true
  }
}; 