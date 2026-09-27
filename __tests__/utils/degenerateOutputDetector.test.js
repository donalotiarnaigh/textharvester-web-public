const {
  computeEntropy,
  computeCCR,
  computeLengthRatio,
  detectDegenerate,
} = require('../../src/utils/degenerateOutputDetector');

describe('degenerateOutputDetector', () => {
  describe('computeEntropy', () => {
    it('returns 0 for empty text', () => {
      expect(computeEntropy('')).toBe(0);
    });

    it('returns lower entropy for repetitive text than varied text', () => {
      const repetitive = computeEntropy('AAAAAAAAAAAAAA');
      const varied = computeEntropy('John Smith died 1901');

      expect(repetitive).toBeLessThan(varied);
    });
  });

  describe('computeCCR', () => {
    it('returns 0 for plain Latin text and digits', () => {
      expect(computeCCR('John Smith 1901. RIP')).toBe(0);
    });

    it('counts disallowed symbols as confusion characters', () => {
      expect(computeCCR('@@@@ #### !!!!')).toBeGreaterThan(0.4);
    });
  });

  describe('computeLengthRatio', () => {
    it('calculates ratio from text length and expected minimum', () => {
      expect(computeLengthRatio('1234567890', 20)).toBe(0.5);
    });

    it('returns 1 when no expected minimum is provided', () => {
      expect(computeLengthRatio('short', 0)).toBe(1);
    });
  });

  describe('detectDegenerate', () => {
    const thresholds = {
      enabled: true,
      ccrThreshold: 0.4,
      minEntropy: 1.5,
      lengthRatioMin: 0.2,
      minLengthForEntropy: 20,
      minLengthForLengthRatio: 20,
      minExpectedBySourceType: {
        memorial: 40,
      },
    };

    it('does not flag normal memorial prose', () => {
      const result = detectDegenerate(
        'In loving memory of John Smith who died 12 March 1901 aged 76 years.',
        'memorial',
        thresholds
      );

      expect(result.isDegenerate).toBe(false);
      expect(result.reasons).toEqual([]);
      expect(result.metrics.ccr).toBeLessThan(0.4);
    });

    it('flags high-CCR symbol-heavy output', () => {
      const result = detectDegenerate('@@@@ #### $$$$ %%%%', 'memorial', thresholds);

      expect(result.isDegenerate).toBe(true);
      expect(result.reasons).toContain('HIGH_CCR');
    });

    it('flags low-entropy repetitive output when long enough', () => {
      const result = detectDegenerate('A'.repeat(60), 'memorial', thresholds);

      expect(result.isDegenerate).toBe(true);
      expect(result.reasons).toContain('LOW_ENTROPY');
    });

    it('does not flag short valid output only for being short', () => {
      const result = detectDegenerate('JOHN SMITH 1842', 'memorial', thresholds);

      expect(result.isDegenerate).toBe(false);
      expect(result.reasons).toEqual([]);
    });

    it('flags low length ratio when output is below source-type floor', () => {
      const result = detectDegenerate(
        'This text is long enough to check ratio.',
        'memorial',
        {
          ...thresholds,
          minExpectedBySourceType: { memorial: 400 },
        }
      );

      expect(result.isDegenerate).toBe(true);
      expect(result.reasons).toContain('LOW_LENGTH_RATIO');
    });

    it('returns metrics only when disabled', () => {
      const result = detectDegenerate('@@@@ #### $$$$ %%%%', 'memorial', {
        ...thresholds,
        enabled: false,
      });

      expect(result.isDegenerate).toBe(false);
      expect(result.reasons).toEqual([]);
      expect(result.metrics.ccr).toBeGreaterThan(0.4);
    });
  });
});
