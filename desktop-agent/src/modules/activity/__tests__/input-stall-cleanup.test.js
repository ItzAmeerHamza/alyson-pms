/**
 * Timer / listener / start-race cleanup for the input detector stack.
 * These guard against orphaned helper processes and leaked intervals that
 * accumulate across Start/Stop cycles — counting logic is untouched.
 */
const { EventEmitter } = require('events');

describe('CrossPlatformInputDetector cleanup', () => {
  let CrossPlatformInputDetector;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.resetModules();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    CrossPlatformInputDetector = require('../../../cross-platform-input-detector');
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test('stop() cancels a pending helper restart (no second helper after Stop+Start)', async () => {
    const detector = new CrossPlatformInputDetector();
    const restart = jest.spyOn(detector, 'startExternalPythonMonitor').mockResolvedValue();
    detector.isActive = true;

    detector._handlePythonFailure('/x/monitor.py', 'exit code: 1');
    expect(detector._retryTimer).toBeTruthy();

    await detector.stop();
    expect(detector._retryTimer).toBeNull();

    detector.isActive = true; // simulate a restart inside the backoff window
    jest.advanceTimersByTime(130000);
    expect(restart).not.toHaveBeenCalled();
  });

  test('retry is skipped when a helper process is already running', () => {
    const detector = new CrossPlatformInputDetector();
    const restart = jest.spyOn(detector, 'startExternalPythonMonitor').mockResolvedValue();
    detector.isActive = true;
    detector._handlePythonFailure('/x/monitor.py', 'exit code: 1');

    detector.pythonProcess = { exitCode: null, signalCode: null, killed: false };
    jest.advanceTimersByTime(5000);
    expect(restart).not.toHaveBeenCalled();
  });

  test('retry still restarts a crashed helper', () => {
    const detector = new CrossPlatformInputDetector();
    const restart = jest.spyOn(detector, 'startExternalPythonMonitor').mockResolvedValue();
    detector.isActive = true;
    detector._handlePythonFailure('/x/monitor.py', 'exit code: 1');

    detector.pythonProcess = { exitCode: 1, signalCode: null, killed: false };
    jest.advanceTimersByTime(5000);
    expect(restart).toHaveBeenCalledWith('/x/monitor.py');
  });

  test('startActivityTracking keeps one interval and stop() clears it', async () => {
    const detector = new CrossPlatformInputDetector();
    const before = jest.getTimerCount();
    detector.startActivityTracking();
    detector.startActivityTracking();
    expect(jest.getTimerCount()).toBe(before + 1);

    await detector.stop();
    expect(jest.getTimerCount()).toBe(before);
  });

  test('stop() removes fallback powerMonitor handlers and its own subscribers', async () => {
    const powerMonitor = new EventEmitter();
    const otherModule = jest.fn();
    powerMonitor.on('user-activity', otherModule);

    const detector = new CrossPlatformInputDetector();
    detector.electronModules = { powerMonitor };
    detector.isActive = true;
    detector.startWindowsFallbackDetection();
    expect(powerMonitor.listenerCount('user-activity')).toBe(2);
    detector.on('keyPress', () => {});

    await detector.stop();
    expect(powerMonitor.listeners('user-activity')).toEqual([otherModule]);
    expect(detector.listenerCount('keyPress')).toBe(0);
  });
});

describe('UnifiedInputManager start/stop race', () => {
  let detectors;
  let startGate;

  beforeEach(() => {
    jest.resetModules();
    detectors = [];
    startGate = null;
    jest.doMock('../../../cross-platform-input-detector.js', () => {
      const { EventEmitter: EE } = require('events');
      return class FakeDetector extends EE {
        constructor() {
          super();
          this.stop = jest.fn().mockResolvedValue();
          this.start = jest.fn(() => startGate.promise);
          detectors.push(this);
        }
      };
    });
  });

  afterEach(() => {
    jest.dontMock('../../../cross-platform-input-detector.js');
  });

  function deferred() {
    let resolve;
    const promise = new Promise((r) => { resolve = r; });
    return { promise, resolve };
  }

  test('Stop during detector.start() stops the detector instead of orphaning it', async () => {
    const UnifiedInputManager = require('../input-manager');
    const powerMonitor = new EventEmitter();
    powerMonitor.getSystemIdleTime = () => 0;
    const m = new UnifiedInputManager();
    await m.initialize({ powerMonitor });

    startGate = deferred();
    const platformInit = jest.spyOn(m, 'initializePlatformSpecific');
    await m.startTracking();
    m.stopTracking();
    startGate.resolve();
    await platformInit.mock.results[0].value;

    expect(detectors).toHaveLength(1);
    expect(detectors[0].stop).toHaveBeenCalledTimes(1);
    expect(m.platformDetector).toBeUndefined();
  });

  test('normal start adopts the detector', async () => {
    const UnifiedInputManager = require('../input-manager');
    const powerMonitor = new EventEmitter();
    powerMonitor.getSystemIdleTime = () => 0;
    const m = new UnifiedInputManager();
    await m.initialize({ powerMonitor });

    startGate = deferred();
    const platformInit = jest.spyOn(m, 'initializePlatformSpecific');
    await m.startTracking();
    startGate.resolve();
    await platformInit.mock.results[0].value;

    expect(m.platformDetector).toBe(detectors[0]);
    expect(detectors[0].stop).not.toHaveBeenCalled();
    m.stopTracking();
    expect(detectors[0].stop).toHaveBeenCalledTimes(1);
  });

  test('stopTracking removes only its own powerMonitor listener', async () => {
    const UnifiedInputManager = require('../input-manager');
    const powerMonitor = new EventEmitter();
    powerMonitor.getSystemIdleTime = () => 0;
    const otherModule = jest.fn();
    powerMonitor.on('user-activity', otherModule);
    const m = new UnifiedInputManager();
    await m.initialize({ powerMonitor });

    startGate = deferred();
    startGate.resolve();
    await m.startTracking();
    expect(powerMonitor.listenerCount('user-activity')).toBe(2);
    m.stopTracking();
    expect(powerMonitor.listeners('user-activity')).toEqual([otherModule]);
  });
});
