/**
 * Unit Tests for Perceptual Hash (dHash) Utility
 * Tests image hashing and similarity comparison
 */

const { hammingDistance, areImagesSimilar, THRESHOLDS } = require('../perceptual-hash');

// Note: computeDHash requires Electron's nativeImage which isn't available in Jest
// These tests cover the hash comparison logic which is the critical path

describe('Perceptual Hash Utility', () => {
  describe('hammingDistance', () => {
    it('should return 0 for identical hashes', () => {
      const hash = 'a1b2c3d4e5f67890';
      expect(hammingDistance(hash, hash)).toBe(0);
    });

    it('should return correct distance for different hashes', () => {
      // Two hashes differing by 1 bit
      const hash1 = '0000000000000000';
      const hash2 = '0000000000000001'; // Last bit different
      expect(hammingDistance(hash1, hash2)).toBe(1);
    });

    it('should return correct distance for more different hashes', () => {
      // ff = 11111111 vs 00 = 00000000 -> 8 bits different
      const hash1 = 'ff00000000000000';
      const hash2 = '0000000000000000';
      expect(hammingDistance(hash1, hash2)).toBe(8);
    });

    it('should return 64 for completely different hashes', () => {
      const hash1 = '0000000000000000';
      const hash2 = 'ffffffffffffffff';
      expect(hammingDistance(hash1, hash2)).toBe(64);
    });

    it('should return 64 for invalid hashes', () => {
      expect(hammingDistance(null, 'a1b2c3d4e5f67890')).toBe(64);
      expect(hammingDistance('a1b2c3d4e5f67890', null)).toBe(64);
      expect(hammingDistance('short', 'a1b2c3d4e5f67890')).toBe(64);
      expect(hammingDistance('a1b2c3d4e5f67890', 'tooooooooooolong')).toBe(64);
    });
  });

  describe('areImagesSimilar', () => {
    it('should detect exact duplicates', () => {
      const hash = 'a1b2c3d4e5f67890';
      const result = areImagesSimilar(hash, hash);
      
      expect(result.isSimilar).toBe(true);
      expect(result.distance).toBe(0);
      expect(result.confidence).toBe(1);
      expect(result.reason).toContain('Exact match');
    });

    it('should detect near duplicates (distance 1-5)', () => {
      // Hashes with small difference (simulating cursor movement)
      const hash1 = '0000000000000000';
      const hash2 = '0000000000000003'; // 2 bits different
      const result = areImagesSimilar(hash1, hash2);
      
      expect(result.isSimilar).toBe(true);
      expect(result.distance).toBe(2);
      expect(result.reason).toContain('Near duplicate');
    });

    it('should detect similar content (distance 6-10)', () => {
      // Hashes with moderate difference (simulating slight scroll)
      const hash1 = '0000000000000000';
      const hash2 = '00000000000000ff'; // 8 bits different
      const result = areImagesSimilar(hash1, hash2, 10);
      
      expect(result.isSimilar).toBe(true);
      expect(result.distance).toBe(8);
      expect(result.reason).toContain('Similar content');
    });

    it('should reject different content (distance > threshold)', () => {
      const hash1 = '0000000000000000';
      const hash2 = 'ffffffffffffffff'; // 64 bits different
      const result = areImagesSimilar(hash1, hash2);
      
      expect(result.isSimilar).toBe(false);
      expect(result.distance).toBe(64);
      expect(result.reason).toContain('Different content');
    });

    it('should handle missing hashes', () => {
      const result = areImagesSimilar(null, 'a1b2c3d4e5f67890');
      
      expect(result.isSimilar).toBe(false);
      expect(result.distance).toBe(64);
    });

    it('should respect custom threshold', () => {
      const hash1 = '0000000000000000';
      const hash2 = '000000000000000f'; // 4 bits different
      
      // With default threshold (10), should be similar
      expect(areImagesSimilar(hash1, hash2, 10).isSimilar).toBe(true);
      
      // With strict threshold (2), should not be similar
      expect(areImagesSimilar(hash1, hash2, 2).isSimilar).toBe(false);
    });
  });

  describe('THRESHOLDS', () => {
    it('should have expected threshold values', () => {
      expect(THRESHOLDS.EXACT_DUPLICATE).toBe(0);
      expect(THRESHOLDS.NEAR_DUPLICATE).toBe(5);
      expect(THRESHOLDS.SIMILAR_CONTENT).toBe(10);
      expect(THRESHOLDS.DIFFERENT).toBe(11);
    });
  });

  describe('real-world hash scenarios', () => {
    it('should correctly identify typical duplicate scenarios', () => {
      // Simulated hashes from real screenshots
      const scenarios = [
        {
          name: 'Same page, same scroll position',
          hash1: 'a1b2c3d4e5f67890',
          hash2: 'a1b2c3d4e5f67890',
          expectDuplicate: true
        },
        {
          name: 'Same page, cursor moved',
          hash1: 'a1b2c3d4e5f67890',
          hash2: 'a1b2c3d4e5f67892', // 1 bit different
          expectDuplicate: true
        },
        {
          name: 'Completely different pages',
          hash1: 'a1b2c3d4e5f67890',
          hash2: '0f1e2d3c4b5a6978', // many bits different
          expectDuplicate: false
        }
      ];

      scenarios.forEach(scenario => {
        const result = areImagesSimilar(scenario.hash1, scenario.hash2);
        expect(result.isSimilar).toBe(scenario.expectDuplicate);
      });
    });
  });
});
