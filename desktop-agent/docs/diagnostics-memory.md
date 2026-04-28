# Memory Profiler Documentation

## Overview

The TimeFlow desktop agent includes a lightweight memory profiler that continuously monitors memory usage and provides insights into potential memory leaks and performance issues.

## Features

- **Continuous Monitoring**: Polls memory metrics every 5 seconds (configurable)
- **Comprehensive Metrics**: Collects RSS, heap usage, external memory, and more
- **Dual Output Formats**: NDJSON for analysis, CSV for spreadsheet review
- **Manual GC Control**: Optional garbage collection triggering and monitoring
- **Process Metrics**: Electron-specific process memory information
- **Real-time HUD**: Optional React component for live monitoring

## Quick Start

### Enable Memory Profiling

```bash
# Basic memory profiling
MEM_PROFILER=1 npm start

# Full profiling with CSV output and GC exposure
EXPOSE_GC=1 MEM_PROFILER=1 MEM_CSV=1 MEM_INTERVAL_MS=5000 npm start

# Using the convenience script
npm run dev:mem
```

### Get Memory Snapshot

```bash
# Check if app is running and get instructions
npm run mem:snapshot

# Or manually in DevTools console
await window.getMemorySample()
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MEM_PROFILER` | - | Set to `1` to enable memory profiling |
| `MEM_INTERVAL_MS` | `5000` | Polling interval in milliseconds |
| `MEM_CSV` | - | Set to `1` to enable CSV output |
| `EXPOSE_GC` | - | Set to `1` to expose garbage collection |

### Command Line Flags

The profiler automatically adds these Electron flags when enabled:

- `--enable-precise-memory-info`: Provides accurate memory measurements
- `--js-flags="--expose-gc"`: Exposes garbage collection (when EXPOSE_GC=1)

## Output Files

### Log Directory Structure

```
logs/
└── memory/
    ├── 2024-01-15.ndjson    # Newline-delimited JSON logs
    └── 2024-01-15.csv       # CSV format (if enabled)
```

### NDJSON Format

Each line contains a JSON object with memory metrics:

```json
{"timestamp":1705276800000,"pid":12345,"type":"main","rssMB":45.2,"heapUsedMB":12.8,"heapTotalMB":25.6,"externalMB":3.2,"arrayBuffersMB":0.5,"privateMB":42.1,"residentMB":45.2,"cpuPercent":2.3}
```

### CSV Format

Headers: `timestamp,pid,type,rssMB,heapUsedMB,heapTotalMB,externalMB,arrayBuffersMB,privateMB,residentMB,cpuPercent`

## Memory Metrics Explained

### Core Metrics

- **RSS (Resident Set Size)**: Total memory allocated in RAM
- **Heap Used**: JavaScript heap memory currently in use
- **Heap Total**: Total JavaScript heap memory allocated
- **External**: Memory used by C++ objects bound to JavaScript
- **Array Buffers**: Memory used by ArrayBuffer and SharedArrayBuffer

### Electron-Specific Metrics

- **Private**: Process-private memory (not shared with other processes)
- **Resident**: Memory resident in RAM
- **CPU Percent**: CPU usage percentage

### GC Events

When `EXPOSE_GC=1`, the profiler logs garbage collection events:

```json
{"timestamp":1705276800000,"pid":12345,"type":"gc","event":"manual_gc","beforeHeapUsedMB":12.8,"afterHeapUsedMB":11.2,"freedMB":1.6}
```

## API Reference

### Main Process

```javascript
const { startMemoryProfiler, stopMemoryProfiler, getMemoryProfiler } = require('./src/diagnostics/memoryProfiler');

// Start profiling
const profiler = startMemoryProfiler({
  intervalMs: 5000,
  csv: true,
  exposeGC: true
});

// Get current snapshot
const snapshot = await profiler.getSnapshot();

// Trigger manual GC
await profiler.triggerGC();

// Stop profiling
stopMemoryProfiler();
```

### Renderer Process

```javascript
// Get memory sample via IPC
const result = await window.getMemorySample();

// Use the Memory HUD component
const { MemoryHUD } = require('./src/renderer/diagnostics/memory');
// Then use <MemoryHUD /> in your React app
```

### IPC Handlers

- `diagnostics:memory-snapshot`: Returns current memory metrics

## Memory HUD Component

The optional React component provides real-time memory monitoring:

```jsx
import { MemoryHUD } from './src/renderer/diagnostics/memory';

function App() {
  return (
    <div>
      <h1>TimeFlow Desktop Agent</h1>
      <MemoryHUD />
    </div>
  );
}
```

Features:
- **Live Updates**: Refreshes every 5 seconds
- **Sparkline Chart**: 60-point trend visualization
- **Click to Refresh**: Manual refresh capability
- **Minimal Overlay**: Fixed position, non-intrusive

## Analysis and Debugging

### Comparing Heap Snapshots

1. **Enable Profiling**: Start with `MEM_PROFILER=1`
2. **Take Baseline**: Note initial heap usage
3. **Perform Actions**: Use the app normally
4. **Monitor Trends**: Check CSV/NDJSON logs
5. **Identify Leaks**: Look for continuously increasing heap usage

### Common Memory Leak Patterns

#### 1. Event Listeners Not Removed
```javascript
// ❌ Bad: Listener never removed
element.addEventListener('click', handler);

// ✅ Good: Store reference and remove
const boundHandler = handler.bind(this);
element.addEventListener('click', boundHandler);
// Later...
element.removeEventListener('click', boundHandler);
```

#### 2. Intervals Not Cleared
```javascript
// ❌ Bad: Interval never cleared
setInterval(() => {
  // This runs forever
}, 1000);

// ✅ Good: Store and clear interval
const intervalId = setInterval(() => {
  // Do work
}, 1000);
// Later...
clearInterval(intervalId);
```

#### 3. Cached Images/Screenshots
```javascript
// ❌ Bad: Images cached indefinitely
const img = new Image();
img.src = 'data:image/png;base64,...';
// Never cleaned up

// ✅ Good: Clean up when done
const img = new Image();
img.src = 'data:image/png;base64,...';
img.onload = () => {
  // Use image
  img.src = ''; // Clear source
};
```

#### 4. BrowserWindow References
```javascript
// ❌ Bad: Window reference never cleared
let win = new BrowserWindow();
// win variable holds reference

// ✅ Good: Clear reference when closed
let win = new BrowserWindow();
win.on('closed', () => {
  win = null;
});
```

#### 5. Unresolved Promises
```javascript
// ❌ Bad: Promise chain that never resolves
someAsyncOperation().then(() => {
  // This might never execute
});

// ✅ Good: Always handle errors
someAsyncOperation()
  .then(result => {
    // Handle success
  })
  .catch(error => {
    // Handle error
  });
```

#### 6. RxJS/Observables Not Unsubscribed
```javascript
// ❌ Bad: Subscription never unsubscribed
const subscription = observable.subscribe(data => {
  // Handle data
});

// ✅ Good: Store and unsubscribe
const subscription = observable.subscribe(data => {
  // Handle data
});

// Later...
subscription.unsubscribe();
```

### Performance Monitoring

#### Normal Memory Patterns
- **Startup**: High initial allocation, then stabilization
- **Idle**: Stable memory usage with minor fluctuations
- **Activity**: Temporary spikes during operations
- **Cleanup**: Memory should return to baseline after operations

#### Warning Signs
- **Continuous Growth**: Heap usage that never decreases
- **Large Spikes**: Sudden memory jumps without recovery
- **High External Memory**: Large amounts of C++ object memory
- **GC Inefficiency**: Frequent garbage collection with little memory freed

## Troubleshooting

### Profiler Not Starting

1. **Check Environment Variables**: Ensure `MEM_PROFILER=1` is set
2. **Verify Electron Context**: Profiler only works in main process
3. **Check Logs**: Look for initialization errors in console

### No Log Files

1. **Directory Permissions**: Ensure `logs/memory/` can be created
2. **Working Directory**: Check if process.cwd() is correct
3. **File System Access**: Verify write permissions

### High Memory Usage

1. **Enable GC**: Use `EXPOSE_GC=1` to monitor garbage collection
2. **Check Intervals**: Reduce polling frequency if needed
3. **Review Logs**: Analyze memory patterns over time

### Performance Impact

1. **Increase Interval**: Use `MEM_INTERVAL_MS=10000` for less frequent polling
2. **Disable CSV**: Set `MEM_CSV=0` to reduce I/O
3. **Monitor Overhead**: Check if profiler itself is consuming resources

## Integration with Existing Systems

### Cleanup Registry

The memory profiler integrates with the existing cleanup system:

```javascript
// Profiler automatically registers cleanup on stop()
stopMemoryProfiler(); // Clears all timers and intervals
```

### Logging System

Memory profiler logs use the standard logging format:
- Category: `MEMORY-PROFILER`
- Structured data for easy filtering
- Console output for development

### Performance Monitoring

Works alongside existing performance optimizations:
- Respects interval configurations
- Minimal overhead during normal operation
- Can be disabled in production builds

## Best Practices

### Development
- Use `npm run dev:mem` for development with profiling
- Monitor memory during feature development
- Check for leaks after major changes

### Testing
- Run memory tests before releases
- Monitor memory during automated tests
- Use snapshots to verify cleanup

### Production
- Disable profiling in production builds
- Monitor memory usage through system tools
- Set up alerts for memory thresholds

## Future Enhancements

### Planned Features
- **Memory Leak Detection**: Automatic leak pattern recognition
- **Performance Alerts**: Notifications for memory issues
- **Historical Analysis**: Long-term memory trend analysis
- **Integration**: Web admin dashboard integration

### Customization
- **Custom Metrics**: User-defined memory measurements
- **Alert Thresholds**: Configurable memory limits
- **Export Formats**: Additional output formats
- **Remote Monitoring**: Network-based monitoring

## Support

For issues or questions about the memory profiler:

1. **Check Logs**: Review console output and log files
2. **Verify Configuration**: Ensure environment variables are set correctly
3. **Test Isolation**: Try profiling in a clean environment
4. **Report Issues**: Include memory logs and configuration details

## Examples

### Basic Profiling Setup

```bash
# Terminal 1: Start with profiling
MEM_PROFILER=1 MEM_CSV=1 npm start

# Terminal 2: Monitor logs
tail -f logs/memory/$(date +%Y-%m-%d).ndjson

# Terminal 3: Get snapshot
npm run mem:snapshot
```

### Custom Profiling Configuration

```bash
# High-frequency monitoring for debugging
MEM_PROFILER=1 MEM_INTERVAL_MS=1000 MEM_CSV=1 npm start

# GC monitoring for leak detection
EXPOSE_GC=1 MEM_PROFILER=1 MEM_INTERVAL_MS=5000 npm start

# Production monitoring (less frequent)
MEM_PROFILER=1 MEM_INTERVAL_MS=30000 npm start
```

### Integration in Code

```javascript
// In your main application
if (process.env.NODE_ENV === 'development') {
  const { startMemoryProfiler } = require('./diagnostics/memoryProfiler');
  startMemoryProfiler({
    intervalMs: 10000,
    csv: true,
    exposeGC: false
  });
}
```
