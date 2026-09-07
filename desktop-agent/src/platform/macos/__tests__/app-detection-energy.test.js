const { looksLikeBrowserApp } = require('../app-detection');

describe('macos app detection energy helpers', () => {
  it('treats common browser process names as browsers', () => {
    expect(looksLikeBrowserApp('Safari')).toBe(true);
    expect(looksLikeBrowserApp('Google Chrome')).toBe(true);
    expect(looksLikeBrowserApp('Microsoft Edge')).toBe(true);
    expect(looksLikeBrowserApp('Brave Browser')).toBe(true);
    expect(looksLikeBrowserApp('Arc')).toBe(true);
  });

  it('does not treat editors or Electron itself as browsers', () => {
    expect(looksLikeBrowserApp('Cursor')).toBe(false);
    expect(looksLikeBrowserApp('Code')).toBe(false);
    expect(looksLikeBrowserApp('Slack')).toBe(false);
    expect(looksLikeBrowserApp('Alyson PM')).toBe(false);
  });
});
