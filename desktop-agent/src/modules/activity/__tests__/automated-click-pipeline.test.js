jest.mock('../../core/cleanup-registry', () => ({ registerResource: jest.fn(), registerInterval: jest.fn() }));
jest.mock('../../../lib/meeting-presence-probe', () => ({
  probeMeetingStillOpen: jest.fn().mockResolvedValue({ active: false, conclusive: true }),
  clearMeetingPresenceCache: jest.fn(),
}));

let CrossPlatformInputDetector;
let EnhancedIdleMonitor;
beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  CrossPlatformInputDetector = require('../../../cross-platform-input-detector');
  EnhancedIdleMonitor = require('../enhanced-idle-monitor');
});
afterEach(() => {
  jest.useRealTimers();
  delete global.automatedClickDetector;
  delete global.unifiedInputManager;
});

function counting(detector) {
  const seen = { click: 0, key: 0, move: 0 };
  detector.on('mouseClick', () => { seen.click += 1; });
  detector.on('keyPress', () => { seen.key += 1; });
  detector.on('mouseMovement', () => { seen.move += 1; });
  return seen;
}

describe('automated clicks in the real input path', () => {
  it('auto-clicker run: clicks after the 29th are not counted; keys still are', () => {
    jest.useFakeTimers();
    jest.setSystemTime(0);
    const detector = new CrossPlatformInputDetector();
    const seen = counting(detector);
    for (let i = 0; i < 100; i++) {
      jest.setSystemTime((i + 1) * 7000);
      detector.handleExternalPythonEvent({ type: 'click', platform: 'windows', injected: true });
    }
    detector.handleExternalPythonEvent({ type: 'key', platform: 'windows' });
    expect(seen.click).toBe(29);
    expect(seen.key).toBe(1);
  });

  it('a real user who clicks, types and moves the mouse loses nothing', () => {
    jest.useFakeTimers();
    const detector = new CrossPlatformInputDetector();
    const seen = counting(detector);
    let ts = 0;
    for (let i = 0; i < 150; i++) {
      ts += 2000 + ((i * 7919) % 3000); // irregular
      jest.setSystemTime(ts);
      if (i % 4 === 0) detector.handleExternalPythonEvent({ type: 'move', platform: 'windows' });
      detector.handleExternalPythonEvent({ type: 'click', platform: 'windows' });
      if (i % 3 === 0) detector.handleExternalPythonEvent({ type: 'key', platform: 'windows' });
    }
    expect(seen.click).toBe(150);
    expect(seen.key).toBe(50);
  });

  it('Stop clears the run so the next session starts fresh', async () => {
    jest.useFakeTimers();
    const detector = new CrossPlatformInputDetector();
    for (let i = 0; i < 40; i++) {
      jest.setSystemTime((i + 1) * 5000);
      detector.handleExternalPythonEvent({ type: 'click', platform: 'macos' });
    }
    expect(global.automatedClickDetector?.isActive()).toBe(true);
    await detector.stop();
    expect(global.automatedClickDetector).toBeNull();
  });
});

describe('automated keys in the real input path', () => {
  it('Windows held key: repeats stop counting after a minute; typing afterwards counts', () => {
    jest.useFakeTimers();
    jest.setSystemTime(0);
    const detector = new CrossPlatformInputDetector();
    const seen = counting(detector);
    detector.handleExternalPythonEvent({ type: 'key', platform: 'windows' });
    for (let i = 1; i <= 33 * 180; i++) {
      jest.setSystemTime(i * 30);
      detector.handleExternalPythonEvent({ type: 'key', platform: 'windows', repeat: true });
    }
    expect(seen.key).toBe(1 + 2000); // press + first 60 s of repeats
    jest.setSystemTime(33 * 180 * 30 + 500);
    detector.handleExternalPythonEvent({ type: 'key', platform: 'windows' });
    expect(seen.key).toBe(2002);
  });
});

describe('idle while an auto-clicker runs', () => {
  it('idle uses time since the last real input, not the OS timer the clicker keeps resetting', () => {
    jest.useFakeTimers();
    const detector = new CrossPlatformInputDetector();
    jest.setSystemTime(0);
    detector.handleExternalPythonEvent({ type: 'key', platform: 'windows' });
    for (let i = 0; i < 120; i++) {
      jest.setSystemTime((i + 1) * 7000);
      detector.handleExternalPythonEvent({ type: 'click', platform: 'windows' });
    }
    global.unifiedInputManager = { getIdleTime: () => 3, stats: { keystrokes: 0, mouseClicks: 0 } }; // OS: "active 3 s ago"
    const monitor = new EnhancedIdleMonitor({ user_id: 'u', enable_idle_detection: true });
    const idle = monitor._getEffectiveIdleSeconds();
    expect(idle.automated).toBe(true);
    expect(idle.os).toBe((120 * 7000 - 29 * 7000) / 1000); // since the last real click
  });

  it('no automation → idle is exactly the OS figure, as before', () => {
    global.unifiedInputManager = { getIdleTime: () => 42, stats: { keystrokes: 0, mouseClicks: 0 } };
    const monitor = new EnhancedIdleMonitor({ user_id: 'u', enable_idle_detection: true });
    const idle = monitor._getEffectiveIdleSeconds();
    expect(idle.os).toBe(42);
    expect(idle.automated).toBe(false);
  });
});
