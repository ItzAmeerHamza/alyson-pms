jest.mock('electron', () => ({ app: { getAppMetrics: () => [
  { type: 'Browser', pid: 1, cpu: { percentCPUUsage: 1 }, memory: { workingSetSize: 200 * 1024 } },
  { type: 'Tab', pid: 2, cpu: { percentCPUUsage: 2 }, memory: { workingSetSize: 3000 * 1024 } },
] } }), { virtual: true });
const PM = require('../performanceMonitor');
test('sample includes per-process memory', () => {
  const pm = new (PM.PerformanceMonitor || PM.default || PM)({ enabled: true });
  const s = pm.sampleCpuUsage();
  expect(s.totalMemMb).toBe(3200);
  expect(s.processMemMb).toEqual({ Browser: 200, Tab: 3000 });
  expect(s.processCount).toBe(2);
  pm.stopCpuUsageLogging?.();
});
test('high memory watch warns once', () => {
  jest.useFakeTimers();
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const pm = new (PM.PerformanceMonitor || PM.default || PM)({ enabled: true });
  pm.startHighMemoryWatch();
  jest.advanceTimersByTime(30_000); jest.advanceTimersByTime(30_000);
  const hits = warn.mock.calls.filter(c => String(c[0]).includes('HIGH MEMORY'));
  expect(hits.length).toBe(1);
  expect(hits[0][0]).toContain('3200MB');
  pm.stopCpuUsageLogging();
});
