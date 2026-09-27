const { computeDisagreementScore } = require('../../src/utils/disagreementScore');

describe('computeDisagreementScore', () => {
  it('returns null when confidenceScores is empty and no warnings', () => {
    expect(computeDisagreementScore({}, [])).toBeNull();
    expect(computeDisagreementScore(null, null)).toBeNull();
    expect(computeDisagreementScore(undefined, undefined)).toBeNull();
  });

  it('returns null when confidenceScores has no numeric values and no warnings', () => {
    expect(computeDisagreementScore({ a: 'high', b: null }, [])).toBeNull();
  });

  it('returns minimum score when scores present and no warnings', () => {
    expect(computeDisagreementScore({ a: 0.9, b: 0.5 }, [])).toBe(0.5);
    expect(computeDisagreementScore({ a: 1.0 }, [])).toBe(1.0);
  });

  it('applies warning penalty: each warning reduces score by 20%', () => {
    const result = computeDisagreementScore({ a: 0.9, b: 0.8 }, ['W1', 'W2']);
    expect(result).toBeCloseTo(0.8 * 0.8 * 0.8, 5); // minConf=0.8, 2 warnings
  });

  it('uses minConf of 1.0 when no numeric scores but warnings present', () => {
    expect(computeDisagreementScore({}, ['W1'])).toBeCloseTo(0.8, 5);
    expect(computeDisagreementScore(null, ['W1', 'W2'])).toBeCloseTo(0.64, 5);
  });

  it('ignores non-numeric values in confidenceScores', () => {
    expect(computeDisagreementScore({ a: 0.6, b: 'high', c: null }, [])).toBe(0.6);
  });

  it('clamps result to [0, 1]', () => {
    const score = computeDisagreementScore({ a: 1.0 }, []);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});
