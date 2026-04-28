# 🚀 Performance Optimization Guide - TimeFlow Desktop Agent

## 🎯 **Overview**

This guide provides a systematic approach to identify and fix performance bottlenecks in the TimeFlow desktop agent. It's based on the feature-by-feature analysis approach that isolates performance issues by testing individual features.

## 🔍 **Performance Monitoring System**

### **Available Scripts**
- `npm run perf:report` - Generate performance report with top bottlenecks
- `npm run perf:test` - Run automated feature-by-feature testing
- `npm run mem:report` - Memory usage analysis
- `npm run mem:live` - Real-time memory monitoring

### **Environment Variables**
- `PERF_MONITOR=1` - Enable performance monitoring
- `FEAT_SCREENSHOTS=0` - Disable screenshot functionality
- `FEAT_URLS=0` - Disable URL tracking
- `FEAT_SYNC=0` - Disable sync operations
- `FEAT_APPS=0` - Disable app tracking
- `FEAT_IPC=0` - Disable IPC monitoring

## 🧪 **Feature-by-Feature Testing Approach**

### **1. Baseline Test (10 minutes)**
```bash
npm start
# Keep app idle, then run:
npm run perf:report
```

### **2. Screenshots Off Test (10 minutes)**
```bash
FEAT_SCREENSHOTS=0 npm start
# Compare P95 values with baseline
npm run perf:report
```

### **3. URL Tracking Off Test (10 minutes)**
```bash
FEAT_URLS=0 npm start
# Compare P95 values with baseline
npm run perf:report
```

### **4. Sync Off Test (10 minutes)**
```bash
FEAT_SYNC=0 npm start
# Compare P95 values with baseline
npm run perf:report
```

### **5. All Features Off Test (10 minutes)**
```bash
FEAT_SCREENSHOTS=0 FEAT_URLS=0 FEAT_SYNC=0 npm start
# This gives you the baseline app performance
npm run perf:report
```

## 📊 **Performance Targets & Thresholds**

### **Screenshot System**
- **Capture P95**: ≤ 50ms
- **Encode P95**: ≤ 120ms ⚠️ **Critical**
- **Write P95**: ≤ 30ms
- **Upload P95**: ≤ 150ms

### **URL Tracking**
- **Poll P95**: ≤ 10ms
- **Parse P95**: ≤ 20ms

### **App Tracking**
- **Enumerate P95**: ≤ 50ms

### **Sync Operations**
- **Enqueue P95**: ≤ 5ms
- **Batch P95**: ≤ 20ms
- **Post P95**: ≤ 100ms

### **IPC Layer**
- **Calls P95**: ≤ 5ms

### **Event Loop**
- **Lag P99**: ≤ 100ms (idle)

## 🚨 **Common Performance Issues & Solutions**

### **1. Screenshot System Bottlenecks**

#### **Problem**: PNG encoding is slow (>120ms P95)
**Solutions**:
- Move image encoding to utility process
- Switch to WebP with quality 70-80
- Cap resolution to reasonable limits
- Implement quality ladder (high for active, low for idle)

#### **Problem**: Large file uploads blocking main thread
**Solutions**:
- Batch multiple screenshots together
- Compress with gzip before upload
- Use streaming uploads
- Implement backpressure on queue

### **2. URL Tracking Bottlenecks**

#### **Problem**: Frequent polling causing high CPU
**Solutions**:
- Adaptive polling: 1-2Hz when active, 0.2Hz when idle
- Cache domain→category mappings
- Debounce window title reads
- Use efficient regex patterns

#### **Problem**: Heavy parsing operations
**Solutions**:
- Pre-compile regex patterns
- Use lightweight parsing libraries
- Implement parsing timeouts
- Cache parsed results

### **3. App Tracking Bottlenecks**

#### **Problem**: OS calls enumerating windows too often
**Solutions**:
- Lower enumeration cadence
- Sample fast only when user is active
- Coalesce repeated queries
- Cache window information

### **4. Idle Detection & Anti-Cheat**

#### **Problem**: High-frequency input hooks
**Solutions**:
- Run detectors in bursts
- Disable expensive scans when idle
- Centralize listeners to avoid duplicates
- Use efficient event filtering

### **5. Sync & Supabase Bottlenecks**

#### **Problem**: Large JSON payloads
**Solutions**:
- Batch multiple items together
- Compress with gzip
- Chunk large payloads
- Implement size limits

#### **Problem**: Per-item writes
**Solutions**:
- Batch operations
- Use bulk insert/update
- Implement write-behind caching
- Queue non-critical updates

### **6. IPC Layer Bottlenecks**

#### **Problem**: Large buffers across processes
**Solutions**:
- Pass IDs/paths instead of blobs
- Stream large data where possible
- Collapse multiple IPC calls into one
- Use shared memory for large data

### **7. Renderer UI Bottlenecks**

#### **Problem**: Frequent re-renders
**Solutions**:
- Memoize expensive components
- Throttle setState calls
- Pause charts when window is hidden
- Use React.memo and useMemo

### **8. GPU/Canvas/Image Bottlenecks**

#### **Problem**: Frequent ImageBitmap creation/destruction
**Solutions**:
- Reuse OffscreenCanvas
- Pool bitmaps
- Ensure proper disposal after upload
- Use efficient image formats

### **9. Startup Path Bottlenecks**

#### **Problem**: All subsystems starting at once
**Solutions**:
- Lazy-start capture/sync after "ready"
- Stagger initialization
- Gate heavy features until credentials verified
- Implement progressive loading

## ⚡ **Quick Wins (Implement Today)**

### **1. Screenshot Optimization**
```javascript
// Move encoding to utility process
const { encodeImage } = require('./utility-process');
const timerId = perfMonitor.trackScreenshotEncode();
const encodedImage = await encodeImage(rawImage);
perfMonitor.endTimer(timerId);
```

### **2. Adaptive Polling**
```javascript
// Reduce polling frequency when idle
const pollInterval = isUserActive ? 1000 : 5000;
setInterval(pollUrl, pollInterval);
```

### **3. Batch Sync Operations**
```javascript
// Batch multiple items together
const batchSize = 10;
const items = [];
// ... collect items
if (items.length >= batchSize) {
  await syncBatch(items);
  items.length = 0;
}
```

### **4. Efficient IPC**
```javascript
// Single bulk status call instead of multiple
const status = await ipcRenderer.invoke('get-bulk-status', {
  screenshots: true,
  urls: true,
  apps: true
});
```

## 🔧 **Implementation Strategy**

### **Phase 1: Measurement & Analysis (Week 1)**
1. Run baseline performance tests
2. Identify top 3 bottlenecks
3. Implement quick wins
4. Measure improvement

### **Phase 2: Core Optimizations (Week 2-3)**
1. Optimize screenshot system
2. Improve URL tracking efficiency
3. Optimize sync operations
4. Reduce IPC overhead

### **Phase 3: Advanced Optimizations (Week 4)**
1. Implement utility processes
2. Add streaming capabilities
3. Optimize memory usage
4. Fine-tune thresholds

### **Phase 4: Monitoring & Maintenance (Ongoing)**
1. Continuous performance monitoring
2. Automated performance testing
3. Performance regression detection
4. Regular optimization reviews

## 📈 **Measuring Success**

### **Key Metrics**
- **P95 Response Times**: Should decrease across all features
- **Event Loop Lag**: Should stay under 50ms P95
- **Memory Usage**: Should stabilize and not grow continuously
- **CPU Usage**: Should decrease during idle periods

### **Success Criteria**
- Screenshot encode P95 < 120ms
- URL parse P95 < 20ms
- Sync post P95 < 100ms
- Event loop lag P95 < 50ms
- Overall app responsiveness improvement

## 🚀 **Advanced Techniques**

### **1. Content Tracing**
```bash
# Enable detailed tracing for specific features
electron --enable-logging --v=1 --trace-startup --trace-startup-file=trace.json
```

### **2. CPU Profiling**
```bash
# Profile CPU usage
node --prof app.js
node --prof-process isolate-*.log > processed.txt
```

### **3. Memory Profiling**
```bash
# Heap snapshots
npm run mem:snapshot
# Live monitoring
npm run mem:live
```

### **4. Network Analysis**
```bash
# Monitor network requests
curl -H "X-Requested-With: XMLHttpRequest" https://api.example.com/endpoint
```

## 📚 **Resources & References**

### **Electron Performance**
- [Electron Performance Best Practices](https://www.electronjs.org/docs/latest/tutorial/performance)
- [V8 Performance Tips](https://v8.dev/blog/fast-async)
- [Node.js Performance](https://nodejs.org/en/docs/guides/simple-profiling/)

### **Memory Management**
- [Memory Profiling Guide](docs/diagnostics-memory.md)
- [Garbage Collection Optimization](https://v8.dev/blog/fast-async)
- [Memory Leak Detection](https://nodejs.org/en/docs/guides/memory-leaks/)

### **Performance Testing**
- [Automated Testing Script](scripts/automated-perf-test.js)
- [Performance Report Tool](scripts/perf-report.js)
- [Memory Analysis Tools](scripts/memory-analysis-report.js)

## 🎯 **Next Steps**

1. **Run Baseline Test**: Start with `npm start` and generate performance report
2. **Identify Bottlenecks**: Use `npm run perf:report` to see top issues
3. **Implement Quick Wins**: Start with the easiest optimizations
4. **Run Feature Tests**: Use `npm run perf:test` for systematic testing
5. **Measure Improvement**: Compare before/after performance metrics
6. **Iterate**: Continue optimizing based on new bottlenecks

---

*This guide is based on the systematic performance analysis approach for the TimeFlow desktop agent. For questions or additional optimization strategies, refer to the performance monitoring tools and automated testing suite.*
