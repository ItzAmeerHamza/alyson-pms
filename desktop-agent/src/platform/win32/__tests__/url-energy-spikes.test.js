const { WindowsUrlCaptureFast } = require('../windows-url-capture-fast.js');
const { UrlResultCache } = require('../../../lib/url-result-cache');
const { isDesktopAppRunning, PROBE_CACHE_MS, shouldWalkBrowserTabs } = require('../../../lib/meeting-presence-probe');

describe('windows URL capture — energy spikes', () => {
  it('reuses the last URL for the same Edge/Chrome tab instead of UIA every poll', async () => {
    const cap = new WindowsUrlCaptureFast();
    let n = 0;
    cap.getActiveWindowFast = async () => ({
      title: 'Meet - Daily standup - Google Chrome',
      owner: { name: 'chrome.exe', path: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' },
    });
    cap.identifyBrowser = () => ({ isBrowser: true, name: 'chrome', supportsCDP: true });
    cap.parseUrlFromTitle = () => {
      n += 1;
      return { url: 'https://meet.google.com/abc-defg-hij', method: 'window-title' };
    };
    cap.detectViaCDPFast = async () => null;
    cap.detectViaUIAutomation = async () => {
      throw new Error('UIA should not run on a cache hit');
    };

    const first = await cap.getCurrentUrl();
    const second = await cap.getCurrentUrl();

    expect(first.url).toBe('https://meet.google.com/abc-defg-hij');
    expect(second.url).toBe(first.url);
    expect(n).toBe(1);
  });

  it('shares the same multi-minute URL cache as macOS', () => {
    const cap = new WindowsUrlCaptureFast();
    expect(cap.urlCache).toBeInstanceOf(UrlResultCache);
    expect(cap.urlCache.ttlMs).toBeGreaterThanOrEqual(5 * 60 * 1000);
  });
});

describe('meeting presence probe — both platforms', () => {
  it('does not recache-bust every 45s', () => {
    expect(PROBE_CACHE_MS).toBeGreaterThanOrEqual(120000);
  });

  it('does not run PowerShell UIA unless a call is already in session', () => {
    expect(shouldWalkBrowserTabs({})).toBe(false);
    expect(shouldWalkBrowserTabs({ needBackgroundTabs: true })).toBe(true);
  });

  it('exposes a cross-platform running-app check', () => {
    expect(typeof isDesktopAppRunning).toBe('function');
  });
});
