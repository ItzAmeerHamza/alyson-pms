# Performance Safeguards & SLO Monitoring

This document outlines the final layer of defensive performance safeguards that ensure the URL detection system remains fast and stable under all load conditions.

## Quick Configuration (Safe Defaults)

```bash
# Core Performance
URL_DEBUG_LOGGING=false
URL_MAX_PER_TICK=1
URL_WORKER_YIELD_MS=8

# Polling Limits (with caps)
URL_TRACKING_MIN_POLL_MS_ACTIVE=500
URL_TRACKING_MIN_POLL_MS_WAYLAND=1500
URL_TRACKING_POLL_MS_IDLE=2500

# Sync & Batching  
URL_SYNC_BATCH_MAX=100
URL_SYNC_FLUSH_MS=750        # Faster when realtime active
URL_SYNC_OFFLINE_FLUSH_MS=2000
URL_SYNC_STATEMENT_TIMEOUT_MS=2000

# Diagnostics
URL_DIAG_RATE_LIMIT_PER_MIN=120  # Per type
# Global ceiling: 400/min across all types (hardcoded)
```

## 🛡️ Implemented Safeguards

### 1. CPU Budget Watchdog
**Purpose**: Prevents thrashing on weak devices
**How it works**: 
- Monitors CPU time spent in 5-second windows (max 500ms)
- Auto-raises `pollDelay` by +250ms when budget exceeded
- Recovers when CPU usage drops to 50% of limit
- **Zero behavior change**: Same data captured, just paced differently

```javascript
// Triggers at high CPU usage
cpuBudget: {
  windowMs: 5000,     // 5 second monitoring window
  maxMs: 500,         // Max 500ms CPU per window
  backoffActive: false
}
```

### 2. Queue Pressure Valve
**Purpose**: Prevents memory swell during network issues
**How it works**:
- Monitors batch queue sizes (threshold: 500 items)
- Forces flush after 3 seconds of sustained pressure
- Spills to offline queue if network is down
- **Zero data loss**: All events preserved, just routed differently

```javascript
// Configuration
batchConfig: {
  queuePressureThreshold: 500,
  queuePressureTimeout: 3000,
  realtimeFlushMs: 750  // Faster flush for realtime
}
```

### 3. Resolver Concurrency Limits
**Purpose**: Stops resolver stampedes during edge cases
**How it works**:
- Max 1 concurrent resolver per platform (AX/UIA/X11)
- Queues additional requests instead of failing
- **Zero blocking**: Continues with fallbacks while limiting concurrency

### 4. Global Diagnostic Budget
**Purpose**: Protects slow disks/remote logging
**How it works**:
- 400/minute ceiling across all diagnostic types
- Per-type limits remain (120/min default)
- Coalesces to `DIAG_SUPPRESSED` counter when exceeded
- **Zero information loss**: Key diagnostics still emitted

### 5. Adaptive Cache Management
**Purpose**: Optimal memory usage across workloads
**How it works**:
- Monitors hit/miss ratio every 2 minutes
- Shrinks cache to 128 entries if hit rate < 20%
- Grows cache to 256 entries if hit rate > 60%
- **Zero logic change**: Same caching, just adaptive sizing

### 6. Platform Resolver Backoff
**Purpose**: Reduces failed syscall overhead
**How it works**:
- 2-5 second backoff on platform resolver failures
- Title parsing continues during backoff
- Success immediately clears backoff
- **Zero detection loss**: Fallback methods remain active

### 7. Cold-Start Cache Purging
**Purpose**: Prevents stale handle accumulation
**How it works**:
- Purges UI element caches on user/display changes
- Preserves domain/URL parse caches (still useful)
- Triggered by display events or manual call
- **Zero warm-up penalty**: Domain cache retained

### 8. Latency Guard for Realtime
**Purpose**: Improves perceived "live" feel
**How it works**:
- Uses 750ms flush delay when realtime subscribers active
- Reverts to 1000ms when no subscribers
- **Zero extra data**: Same batching, just timing optimization

### 9. Immediate Flush for Close-Only Events
**Purpose**: Quick UI updates for slice endings
**How it works**:
- Detects close-only events (idle/shutdown)
- Flushes batch immediately for quick slice closure
- **Zero duplicate data**: Normal batching for regular events

### 10. Enhanced SLO Monitoring
**Purpose**: Automated performance alerting
**Metrics tracked**:
- **CPU Usage**: `< 2% active, < 0.5% idle` (macOS), `< 3% active, < 1% idle` (Win/Linux)
- **Resolver Success**: `> 90%` (macOS), `> 70%` (Win/Linux)
- **Suppression Rate**: `< 80%`
- **Cache Hit Rate**: `> 50%`
- **Backoff Share**: `< 10%`

## 🔍 Health & Alerting

### System Health Panel Badges

**Performance Badges**:
- 🟡 **CPU Budget Active**: Polling reduced due to high CPU usage
- 🟡 **High CPU Usage**: CPU usage exceeds platform target
- 🟡 **Queue Pressure**: Batch queue under sustained pressure
- 🟡 **Resolver Backoffs**: Platform resolvers in backoff state

**Operational Badges**:
- 🟡 **macOS Accessibility missing**: Using title parsing fallback
- 🔵 **Linux Wayland fallback**: Limited detection on Wayland
- 🟡 **High Suppression**: Many events filtered by timing controls
- 🔵 **Diagnostic Limit**: Approaching rate limit ceiling

**SLO Status Indicators**:
- 🟢 **Good**: Metric within target range
- 🟡 **Warning**: Metric exceeds target, attention needed
- 🔵 **Info**: Metric tracked but not critical

### Health API

```javascript
const health = urlCaptureManager.getHealthStatus();
console.log(health);
```

**Response Structure**:
```javascript
{
  status: 'healthy' | 'degraded' | 'error',
  badges: [
    {
      type: 'warning' | 'info',
      text: 'Badge Text',
      tooltip: 'Detailed explanation'
    }
  ],
  metrics: {
    // Legacy metrics (unchanged)
    captureRate: '85.2%',
    activeWindows: 3,
    pollDelay: '500ms',
    incognitoDropped: 12,
    
    // New SLO metrics
    slo: {
      cpuUsagePercent: 1.2,
      cpuTarget: '< 2% active, < 0.5% idle',
      cpuStatus: 'good',
      
      resolverSuccessRate: 92.1,
      resolverTarget: '> 90%',
      resolverStatus: 'good',
      
      suppressionRate: 15.8,
      suppressionTarget: '< 80%',  
      suppressionStatus: 'good',
      
      cacheHitRate: 67.3,
      cacheTarget: '> 50%',
      cacheStatus: 'good',
      
      backoffShare: 0.0,
      backoffTarget: '< 10%',
      backoffStatus: 'good'
    }
  }
}
```

## 🧪 Performance Tests

### Automated Test Suite

```bash
# Run performance snapshot tests
cd desktop-agent
npm test -- test/perf-snapshot.test.js

# Run resolver hang tests  
npm test -- test/resolver-hang.test.js
```

**Test Coverage**:
- ✅ **Performance Snapshot**: 1000 events within timing constraints
- ✅ **Resolver Timeout**: Watchdog kicks in <200ms
- ✅ **Cache Effectiveness**: Hit rate >30% under load
- ✅ **CPU Budget**: Budget enforcement triggers appropriately
- ✅ **Concurrent Limits**: Max 1 resolver per platform
- ✅ **Hang Recovery**: Title fallback works when resolvers hang
- ✅ **Backoff Recovery**: Success clears backoff state

### Canary Kill-Switch Test

```bash
# Test graceful degradation (safe to run)
URL_PIPELINE_V2_ENABLED=false npm run start

# Should see: "PIPELINE_DISABLED" logs only
# No tracking interruption, just disables v2 optimizations
```

## 🔧 Rollout Strategy

### Phase 1: Safe Environment Variables
Deploy configuration without enabling optimizations:
```bash
URL_DEBUG_LOGGING=false
URL_DIAG_RATE_LIMIT_PER_MIN=120
URL_SYNC_BATCH_MAX=100
```

### Phase 2: Core Safeguards
Enable defensive optimizations:
- CPU budget watchdog
- Queue pressure valve  
- Global diagnostic budget
- Adaptive cache sizing

### Phase 3: Platform Optimizations
Deploy platform-specific improvements:
- Resolver backoff and concurrency limits
- Cold-start cache purging
- Enhanced timeout handling

### Phase 4: SLO Monitoring
Enable comprehensive health monitoring:
- SLO badge integration
- Performance alerting
- Automated test suite in CI

## 📊 Expected Performance Impact

### CPU Usage Reduction
- **Idle state**: Additional 20-40% reduction via CPU budget
- **High load**: Automatic backoff prevents thrashing
- **Cache misses**: Adaptive sizing reduces memory pressure

### Memory Efficiency  
- **Queue pressure**: Prevents unbounded growth
- **Cache management**: Adaptive sizing (128-256 entries)
- **Platform caches**: Cleared on user/display changes

### Reliability Improvements
- **Resolver hangs**: 150ms timeout with fallback
- **Network issues**: Automatic queue spillover
- **High load**: CPU budget prevents degradation

### Zero Behavior Changes
- ✅ Same URL capture accuracy
- ✅ Same timing controls (debounce, min-slice, rate limit)
- ✅ Same privacy processing
- ✅ Same database schema and view contract
- ✅ Same error handling and recovery

## 🚨 Troubleshooting

### High CPU Usage Alerts
1. Check `cpuBudget.backoffActive` status
2. Verify polling delays are within bounds
3. Look for resolver timeout patterns
4. Consider raising `URL_TRACKING_MIN_POLL_MS_ACTIVE`

### Queue Pressure Warnings
1. Monitor network connectivity
2. Check database statement timeouts
3. Verify realtime subscriber count
3. Consider raising `URL_SYNC_BATCH_MAX`

### Low SLO Performance
1. **CPU**: Check for background processes competing
2. **Resolver Success**: Verify platform permissions (Accessibility, etc.)
3. **Cache Hit Rate**: Normal during varied browsing patterns
4. **Suppression**: Expected with rapid URL changes

### Diagnostic Suppression
1. Normal when approaching 400/min global limit
2. Key diagnostics still emitted (errors, timeouts)
3. Reduce `URL_DIAG_RATE_LIMIT_PER_MIN` if needed
4. Check for resolver error loops

## 🎯 Success Metrics

After deployment, monitor these indicators:

**✅ Performance SLOs Met**:
- CPU usage within platform targets
- Resolver success rates above thresholds  
- Queue wait times <1.5s online, <3s offline
- Insert error rates <0.1%

**✅ User Experience**:
- No tracking interruptions
- Smooth UI updates during URL changes
- Quick slice closure on idle/shutdown
- Responsive app performance

**✅ System Stability**:
- No memory leaks or unbounded growth
- Graceful degradation under load
- Automatic recovery from failures
- Clean diagnostic output

This final safeguards layer ensures the URL detection system remains performant and stable while maintaining 100% compatibility with existing behavior.
