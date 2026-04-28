/**
 * Perceptual Hash (dHash) Utility
 * 
 * Computes a difference hash (dHash) for image similarity detection.
 * dHash is robust to scaling, aspect ratio changes, and minor edits.
 * 
 * Algorithm:
 * 1. Resize image to 9x8 grayscale
 * 2. For each row, compare adjacent pixels
 * 3. If pixel[i] > pixel[i+1], bit = 1, else bit = 0
 * 4. Result: 64-bit hash (8 rows × 8 comparisons)
 */

const { createFeatureLogger } = require('./logger');
const log = createFeatureLogger('PHASH');

/**
 * Compute dHash from an image buffer
 * @param {Buffer} buffer - PNG/JPEG image buffer
 * @param {object} electronModules - Electron modules (nativeImage)
 * @returns {string|null} - 16-character hex string (64-bit hash) or null on error
 */
function computeDHash(buffer, electronModules = null) {
  try {
    if (!buffer || buffer.length === 0) {
      log.warn({ step: 'DHASH_SKIP', message: 'Empty buffer' });
      return null;
    }

    // Get nativeImage from Electron
    let nativeImage;
    if (electronModules?.nativeImage) {
      nativeImage = electronModules.nativeImage;
    } else {
      try {
        nativeImage = require('electron').nativeImage;
      } catch (e) {
        // Fallback for when running outside Electron context
        log.warn({ step: 'DHASH_NO_NATIVE_IMAGE', message: 'nativeImage not available' });
        return null;
      }
    }

    // Create image from buffer
    const image = nativeImage.createFromBuffer(buffer);
    if (image.isEmpty()) {
      log.warn({ step: 'DHASH_EMPTY_IMAGE', message: 'Could not decode image' });
      return null;
    }

    // Resize to 9x8 (we need 9 columns to compute 8 differences per row)
    const resized = image.resize({ width: 9, height: 8, quality: 'good' });
    const bitmap = resized.toBitmap();
    const size = resized.getSize();

    if (size.width !== 9 || size.height !== 8) {
      log.warn({ step: 'DHASH_RESIZE_FAILED', ctx: { width: size.width, height: size.height } });
      return null;
    }

    // Bitmap is BGRA format (4 bytes per pixel)
    // Convert to grayscale and compute differences
    const grayscale = [];
    for (let y = 0; y < 8; y++) {
      const row = [];
      for (let x = 0; x < 9; x++) {
        const offset = (y * 9 + x) * 4;
        const b = bitmap[offset];
        const g = bitmap[offset + 1];
        const r = bitmap[offset + 2];
        // Standard grayscale conversion
        const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
        row.push(gray);
      }
      grayscale.push(row);
    }

    // Compute difference hash (64 bits = 8 bytes)
    const hashBytes = [];
    for (let y = 0; y < 8; y++) {
      let byte = 0;
      for (let x = 0; x < 8; x++) {
        // Compare pixel with next pixel in row
        if (grayscale[y][x] > grayscale[y][x + 1]) {
          byte |= (1 << (7 - x));
        }
      }
      hashBytes.push(byte);
    }

    // Convert to hex string
    const hash = hashBytes.map(b => b.toString(16).padStart(2, '0')).join('');
    
    log.debug({ step: 'DHASH_COMPUTED', ctx: { hash, bufferSize: buffer.length } });
    return hash;

  } catch (error) {
    log.error({ step: 'DHASH_ERROR', message: error.message });
    return null;
  }
}

/**
 * Compute Hamming distance between two hashes
 * @param {string} hash1 - 16-character hex hash
 * @param {string} hash2 - 16-character hex hash
 * @returns {number} - Number of differing bits (0-64)
 */
function hammingDistance(hash1, hash2) {
  if (!hash1 || !hash2 || hash1.length !== 16 || hash2.length !== 16) {
    return 64; // Maximum distance if invalid
  }

  let distance = 0;
  for (let i = 0; i < 16; i += 2) {
    const byte1 = parseInt(hash1.substr(i, 2), 16);
    const byte2 = parseInt(hash2.substr(i, 2), 16);
    const xor = byte1 ^ byte2;
    // Count set bits (Brian Kernighan's algorithm)
    let bits = xor;
    while (bits) {
      distance++;
      bits &= bits - 1;
    }
  }

  return distance;
}

/**
 * Check if two images are similar based on hash comparison
 * @param {string} hash1 - First hash
 * @param {string} hash2 - Second hash
 * @param {number} threshold - Maximum Hamming distance to consider similar (default: 10)
 * @returns {object} - { isSimilar, distance, confidence }
 */
function areImagesSimilar(hash1, hash2, threshold = 10) {
  const distance = hammingDistance(hash1, hash2);
  const isSimilar = distance <= threshold;
  
  // Confidence: 1.0 for exact match, decreasing with distance
  // At threshold, confidence is ~0.5
  const confidence = Math.max(0, 1 - (distance / (threshold * 2)));

  return {
    isSimilar,
    distance,
    confidence: Math.round(confidence * 100) / 100,
    reason: distance === 0 
      ? 'Exact match' 
      : distance <= 5 
        ? 'Near duplicate (minor differences like cursor)' 
        : distance <= threshold 
          ? 'Similar content (same page, slight changes)'
          : 'Different content'
  };
}

/**
 * Detection thresholds for duplicate classification
 * STRICT: Tight thresholds to avoid false positives from similar app layouts
 * dHash at 9x8 resolution loses detail - similar structure ≠ same content
 */
const THRESHOLDS = {
  EXACT_DUPLICATE: 0,      // Hamming distance = 0 (identical)
  NEAR_DUPLICATE: 2,       // Same screen, only cursor moved (was 5)
  SIMILAR_CONTENT: 3,      // Nearly identical, tiny change (was 10) - STRICT!
  DIFFERENT: 4             // Anything above this is different (was 11)
};

module.exports = {
  computeDHash,
  hammingDistance,
  areImagesSimilar,
  THRESHOLDS
};
