const {
  escapeHtmlAttr,
  screenshotPopupUrl,
  screenshotTileImgTag,
  screenshotTileUrl,
} = require('../backend-screenshots');

const THUMB =
  'https://d5s1eyv2hvbs5.cloudfront.net/alyson-td-screenshots/a.thumb.jpg?exp=1&sig=abc';
const FULL =
  'https://alyson-pm.s3.us-west-2.amazonaws.com/alyson-td-screenshots/a.jpg?X-Amz-Signature=1';

describe('screenshot gallery URLs', () => {
  it('uses thumb for the tile and full image for open', () => {
    const shot = { thumb_url: THUMB, image_url: FULL };
    expect(screenshotTileUrl(shot)).toBe(THUMB);
    expect(screenshotPopupUrl(shot)).toBe(FULL);
  });

  it('keeps signed query strings in the img tag', () => {
    const html = screenshotTileImgTag(
      { thumb_url: THUMB, image_url: FULL },
      { alt: 'Screenshot 1' },
    );
    expect(html).toContain('exp=1');
    expect(html).toContain('sig=abc');
    expect(html).toContain('data-full=');
    expect(html).toContain('dataset.failed');
    expect(html).not.toContain(`src="${THUMB}"`);
    expect(html).toContain(escapeHtmlAttr(THUMB));
  });
});

describe('fetchScreenshotsFromBackend', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('does not fall through to a stale JWT when the internal API is configured', async () => {
    const calls = [];
    global.fetch = jest.fn(async (url) => {
      calls.push(String(url));
      return {
        ok: false,
        status: 503,
        text: async () => 'unavailable',
        json: async () => ({}),
      };
    });

    const { fetchScreenshotsFromBackend } = require('../backend-screenshots');
    const rows = await fetchScreenshotsFromBackend('1233', {
      backend_api_url: 'https://api.example.com',
      backend_api_key: 'internal-key',
    });

    expect(rows).toBeNull();
    expect(calls.some((url) => url.includes('/data/screenshots'))).toBe(false);
  });
});
