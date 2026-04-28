# Diagnostics

This directory contains diagnostic tools for the TimeFlow desktop agent.

## Memory Profiler

The memory profiler (`memoryProfiler.js`) provides continuous memory monitoring and leak detection.

### Quick Start

```bash
# Enable memory profiling
MEM_PROFILER=1 npm start

# Full profiling with CSV output and GC exposure
EXPOSE_GC=1 MEM_PROFILER=1 MEM_CSV=1 MEM_INTERVAL_MS=5000 npm start

# Using convenience script
npm run dev:mem
```

### Features

- **Continuous Monitoring**: Polls every 5 seconds (configurable)
- **Comprehensive Metrics**: RSS, heap usage, external memory, process info
- **Dual Output**: NDJSON for analysis, CSV for spreadsheet review
- **GC Monitoring**: Optional garbage collection tracking
- **Real-time HUD**: React component for live monitoring

### API

```javascript
const { startMemoryProfiler, stopMemoryProfiler } = require('./diagnostics/memoryProfiler');

// Start profiling
const profiler = startMemoryProfiler({
  intervalMs: 5000,
  csv: true,
  exposeGC: true
});

// Stop profiling
stopMemoryProfiler();
```

### Output Files

- `logs/memory/YYYY-MM-DD.ndjson` - Newline-delimited JSON logs
- `logs/memory/YYYY-MM-DD.csv` - CSV format (if enabled)

### Environment Variables

- `MEM_PROFILER=1` - Enable memory profiling
- `MEM_INTERVAL_MS=5000` - Polling interval in milliseconds
- `MEM_CSV=1` - Enable CSV output
- `EXPOSE_GC=1` - Expose garbage collection

### Scripts

- `npm run dev:mem` - Start with memory profiling enabled
- `npm run mem:snapshot` - Get memory snapshot instructions
- `npm run mem:demo` - Analyze collected memory data

## Renderer Integration

The `renderer/diagnostics/memory.js` provides renderer process access to memory data:

```javascript
// Get memory sample
const result = await window.getMemorySample();

// Use Memory HUD component
const { MemoryHUD } = require('./src/renderer/diagnostics/memory');
```

## Documentation

For comprehensive documentation, see:
- `docs/diagnostics-memory.md` - Full memory profiler documentation
- `scripts/demo-memory-profiler.js` - Usage examples and analysis

## Troubleshooting

1. **Profiler not starting**: Check `MEM_PROFILER=1` environment variable
2. **No log files**: Verify `logs/memory/` directory permissions
3. **High overhead**: Increase `MEM_INTERVAL_MS` or disable CSV output
