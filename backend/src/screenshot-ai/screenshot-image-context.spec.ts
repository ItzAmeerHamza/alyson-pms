import { describe, expect, it } from 'vitest';
import { parseOcrProvider } from './screenshot-image-context.service';

describe('parseOcrProvider', () => {
  it('defaults to tesseract', () => {
    expect(parseOcrProvider(undefined)).toBe('tesseract');
    expect(parseOcrProvider('')).toBe('tesseract');
    expect(parseOcrProvider('Tesseract')).toBe('tesseract');
    expect(parseOcrProvider('unknown')).toBe('tesseract');
  });

  it('accepts none and ignores unknown values', () => {
    expect(parseOcrProvider('none')).toBe('none');
    expect(parseOcrProvider('rekognition')).toBe('tesseract');
  });
});
