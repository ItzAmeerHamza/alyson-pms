const { UrlResultCache, stableUrlCacheTitle, DEFAULT_TTL_MS } = require('../url-result-cache');

describe('url-result-cache (Mac + Windows)', () => {
  it('defaults to a multi-minute TTL', () => {
    expect(DEFAULT_TTL_MS).toBeGreaterThanOrEqual(5 * 60 * 1000);
    expect(new UrlResultCache().ttlMs).toBeGreaterThanOrEqual(5 * 60 * 1000);
  });

  it('treats Meet timer / browser-suffix title flicker as the same tab', () => {
    expect(stableUrlCacheTitle('Meet - Daily standup - Google Chrome'))
      .toBe(stableUrlCacheTitle('Meet - Daily standup 12:01 - Google Chrome'));
    expect(stableUrlCacheTitle('Meet - Daily standup - Microsoft Edge'))
      .toBe(stableUrlCacheTitle('Meet - Daily standup - Microsoft Edge'));
  });

  it('returns a cached miss so the next poll does not re-extract', () => {
    const cache = new UrlResultCache();
    cache.set('chrome.exe', 'Meet - Daily standup - Google Chrome', null);
    const again = cache.get('chrome.exe', 'Meet - Daily standup 12:01 - Google Chrome');
    expect(again.hit).toBe(true);
    expect(again.result).toBeNull();
  });
});
