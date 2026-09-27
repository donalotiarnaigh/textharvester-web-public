'use strict';

const BasePrompt = require('../../../src/utils/prompts/BasePrompt');

// Minimal concrete subclass to exercise BasePrompt methods
class ConcretePrompt extends BasePrompt {
  constructor() {
    super({
      version: '1.0.0',
      description: 'Test prompt',
      fields: {
        name: { type: 'string', description: 'A name field' }
      },
      providers: ['openai', 'anthropic', 'mock']
    });
  }
  getPromptText() {
    return 'Test prompt text';
  }
}

describe('BasePrompt._extractValueAndConfidence', () => {
  let prompt;

  beforeEach(() => {
    prompt = new ConcretePrompt();
  });

  // --- Happy paths: valid envelope with numeric confidence in range [0, 1] ---

  test('returns value and confidence from a valid envelope', () => {
    const result = prompt._extractValueAndConfidence({ value: 'John Smith', confidence: 0.95 });
    expect(result).toEqual({ value: 'John Smith', confidence: 0.95 });
  });

  test('accepts confidence exactly 0.0 (lower boundary)', () => {
    const result = prompt._extractValueAndConfidence({ value: 'text', confidence: 0.0 });
    expect(result).toEqual({ value: 'text', confidence: 0.0 });
  });

  test('accepts confidence exactly 1.0 (upper boundary)', () => {
    const result = prompt._extractValueAndConfidence({ value: 'text', confidence: 1.0 });
    expect(result).toEqual({ value: 'text', confidence: 1.0 });
  });

  test('preserves null value from a valid envelope', () => {
    const result = prompt._extractValueAndConfidence({ value: null, confidence: 0.5 });
    expect(result).toEqual({ value: null, confidence: 0.5 });
  });

  // --- Unhappy paths: no valid confidence → must return null ---

  test('returns confidence: null for a plain string scalar', () => {
    const result = prompt._extractValueAndConfidence('plain text');
    expect(result).toEqual({ value: 'plain text', confidence: null });
  });

  test('returns confidence: null for a plain number scalar', () => {
    const result = prompt._extractValueAndConfidence(42);
    expect(result).toEqual({ value: 42, confidence: null });
  });

  test('returns confidence: null for null input', () => {
    const result = prompt._extractValueAndConfidence(null);
    expect(result).toEqual({ value: null, confidence: null });
  });

  test('returns confidence: null for undefined input', () => {
    const result = prompt._extractValueAndConfidence(undefined);
    expect(result).toEqual({ value: undefined, confidence: null });
  });

  test('returns confidence: null when envelope is missing the confidence key', () => {
    const result = prompt._extractValueAndConfidence({ value: 'text' });
    expect(result).toEqual({ value: 'text', confidence: null });
  });

  test('returns confidence: null for out-of-range confidence -0.1', () => {
    const result = prompt._extractValueAndConfidence({ value: 'text', confidence: -0.1 });
    expect(result).toEqual({ value: 'text', confidence: null });
  });

  test('returns confidence: null for out-of-range confidence 1.5', () => {
    const result = prompt._extractValueAndConfidence({ value: 'text', confidence: 1.5 });
    expect(result).toEqual({ value: 'text', confidence: null });
  });

  test('returns confidence: null for NaN confidence', () => {
    const result = prompt._extractValueAndConfidence({ value: 'text', confidence: NaN });
    expect(result).toEqual({ value: 'text', confidence: null });
  });

  test('returns confidence: null when confidence is a string (not a number)', () => {
    const result = prompt._extractValueAndConfidence({ value: 'text', confidence: '0.9' });
    expect(result).toEqual({ value: 'text', confidence: null });
  });

  // --- needs_review logic: null confidence must flag a record for review ---
  // Verified through validateAndConvert: a field with null confidence should propagate
  // to _confidence_scores so the caller can flag needs_review.

  test('validateAndConvert propagates null confidence into confidenceScores for a scalar field', () => {
    // When the model returns a plain scalar (no envelope), confidence must be null
    const data = { name: 'John' };
    const { data: resultData, confidenceScores } = prompt.validateAndConvert(data);
    expect(confidenceScores).toHaveProperty('name', null);
    // Verify no underscore-prefixed keys in data
    expect(Object.keys(resultData).every(k => !k.startsWith('_'))).toBe(true);
  });

  test('validateAndConvert propagates null confidence for missing confidence key in envelope', () => {
    const data = { name: { value: 'John' } };
    const { data: resultData, confidenceScores } = prompt.validateAndConvert(data);
    expect(confidenceScores).toHaveProperty('name', null);
    expect(Object.keys(resultData).every(k => !k.startsWith('_'))).toBe(true);
  });

  test('validateAndConvert propagates valid confidence score from envelope', () => {
    const data = { name: { value: 'John', confidence: 0.88 } };
    const { data: resultData, confidenceScores } = prompt.validateAndConvert(data);
    expect(confidenceScores).toHaveProperty('name', 0.88);
    expect(Object.keys(resultData).every(k => !k.startsWith('_'))).toBe(true);
  });
});
