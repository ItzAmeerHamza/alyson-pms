const { DarwinUrlCapture } = require('../urlCapture.js');
const {
  PROBE_CACHE_MS,
  shouldWalkBrowserTabs,
  listChromeFamilyWindowTitlesMac,
} = require('../../../lib/meeting-presence-probe');

describe('darwin URL capture — energy spikes', () => {
  it('reuses the last URL for the same browser tab title instead of AppleScript every poll', async () => {
    const cap = new DarwinUrlCapture();
    cap.getFrontmostAppAsync = async () => ({
      name: 'Google Chrome',
      title: 'Meet - Daily standup - Google Chrome',
      bundleId: 'com.google.Chrome',
    });
    cap.executeAppleScript = jest.fn(async () => 'https://meet.google.com/abc-defg-hij');

    const first = await cap.getCurrentUrl();
    const second = await cap.getCurrentUrl();

    expect(first.url).toBe('https://meet.google.com/abc-defg-hij');
    expect(second.url).toBe(first.url);
    expect(cap.executeAppleScript).toHaveBeenCalledTimes(1);
  });

  it('caches same-title URLs for minutes, not 10 seconds', () => {
    const cap = new DarwinUrlCapture();
    expect(cap.urlCacheTTL).toBeGreaterThanOrEqual(5 * 60 * 1000);
  });

  it('does not re-run AppleScript when Meet title only changes a timer suffix', async () => {
    const cap = new DarwinUrlCapture();
    let title = 'Meet - Daily standup - Google Chrome';
    cap.getFrontmostAppAsync = async () => ({
      name: 'Google Chrome',
      title,
      bundleId: 'com.google.Chrome',
    });
    cap.executeAppleScript = jest.fn(async () => 'https://meet.google.com/abc-defg-hij');

    await cap.getCurrentUrl();
    title = 'Meet - Daily standup 12:01 - Google Chrome';
    await cap.getCurrentUrl();

    expect(cap.executeAppleScript).toHaveBeenCalledTimes(1);
  });

  it('caches a failed Chrome extract so the next poll does not AppleScript again', async () => {
    const cap = new DarwinUrlCapture();
    cap.getFrontmostAppAsync = async () => ({
      name: 'Google Chrome',
      title: 'Meet - Daily standup - Google Chrome',
      bundleId: 'com.google.Chrome',
    });
    cap.executeAppleScript = jest.fn(async () => '');

    const first = await cap.getCurrentUrl();
    const second = await cap.getCurrentUrl();

    expect(first).toBeNull();
    expect(second).toBeNull();
    expect(cap.executeAppleScript).toHaveBeenCalledTimes(1);
  });
});

describe('meeting presence probe — energy spikes', () => {
  it('does not recache-bust every 45s', () => {
    expect(PROBE_CACHE_MS).toBeGreaterThanOrEqual(120000);
  });

  it('does not walk every Chrome tab unless a call is already in session', () => {
    expect(shouldWalkBrowserTabs({})).toBe(false);
    expect(shouldWalkBrowserTabs({ needBackgroundTabs: false })).toBe(false);
    expect(shouldWalkBrowserTabs({ needBackgroundTabs: true })).toBe(true);
  });

  it('exposes a cheap Chrome window-title path (not every tab URL)', async () => {
    const windows = await listChromeFamilyWindowTitlesMac();
    expect(Array.isArray(windows)).toBe(true);
  });
});
