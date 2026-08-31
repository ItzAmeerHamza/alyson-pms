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
