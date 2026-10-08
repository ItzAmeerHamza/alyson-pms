const systemMonitor = require('../system-monitor');

describe('permission / health poll cadence', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    systemMonitor.stopPermissionMonitoring();
    systemMonitor.stopPeriodicHealthCheck();
    jest.useRealTimers();
  });

  it('polls permissions every 15 minutes, not every 2', () => {
    expect(systemMonitor.PERMISSION_MONITOR_INTERVAL_MS).toBe(15 * 60 * 1000);

    const spy = jest.spyOn(global, 'setInterval').mockReturnValue(1234);
    systemMonitor.permissionMonitorInterval = null;
    systemMonitor.startPermissionMonitoring();

    expect(spy).toHaveBeenCalledWith(expect.any(Function), 15 * 60 * 1000);
    spy.mockRestore();
  });

  it('runs a cheap health tick while tracking instead of the full 5-minute suite', async () => {
    expect(systemMonitor.PERIODIC_HEALTH_INTERVAL_MS).toBe(15 * 60 * 1000);

    const spy = jest.spyOn(global, 'setInterval').mockReturnValue(5678);
    const cheap = jest.spyOn(systemMonitor, 'checkPermissions').mockResolvedValue({ status: 'pass' });
    const full = jest.spyOn(systemMonitor, 'performComprehensiveHealthCheck').mockResolvedValue({ overall: 'healthy' });

    global.isTracking = true;
    systemMonitor.healthCheckInterval = null;
    systemMonitor.startPeriodicHealthCheck();

    expect(spy).toHaveBeenCalledWith(expect.any(Function), 15 * 60 * 1000);
    await spy.mock.calls[0][0]();

    expect(cheap).toHaveBeenCalledWith({ cheap: true });
    expect(full).not.toHaveBeenCalled();

    global.isTracking = false;
    spy.mockRestore();
    cheap.mockRestore();
    full.mockRestore();
  });
});
