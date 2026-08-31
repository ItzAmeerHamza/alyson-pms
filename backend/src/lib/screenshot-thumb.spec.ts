import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { createScreenshotThumb, thumbS3KeyFromOriginal } from './screenshot-thumb';

describe('thumbS3KeyFromOriginal', () => {
  it('inserts .thumb before the extension', () => {
    expect(
      thumbS3KeyFromOriginal(
        'alyson-td-screenshots/2026/08/27/organization_1/user_12/abc.jpg',
      ),
    ).toBe('alyson-td-screenshots/2026/08/27/organization_1/user_12/abc.thumb.jpg');
  });
});

describe('createScreenshotThumb', () => {
  it('writes a smaller JPEG than the source screenshot', async () => {
    const source = readFileSync(
      join(__dirname, '../screenshot-ai/__fixtures__/ocr-fixture.png'),
    );
    const thumb = await createScreenshotThumb(source);
    expect(thumb.slice(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))).toBe(true);
    expect(thumb.length).toBeLessThan(source.length);
    expect(thumb.length).toBeGreaterThan(200);
  });
});
