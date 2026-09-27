const { getProcessor } = require('../../../src/utils/processors');

describe('processor registry', () => {
  it('should return correct processor for grave_record_card', () => {
    const processor = getProcessor('grave_record_card');
    expect(processor).toBeDefined();
    expect(typeof processor).toBe('function');
  });

  it('should return correct processor for burial_register', () => {
    const processor = getProcessor('burial_register');
    expect(processor).toBeDefined();
    expect(typeof processor).toBe('function');
  });

  it('should return correct processor for monument_classification', () => {
    const processor = getProcessor('monument_classification');
    expect(processor).toBeDefined();
    expect(typeof processor).toBe('function');
  });

  it('should return memorial processor for memorial sourceType', () => {
    const processor = getProcessor('memorial');
    expect(processor).toBeDefined();
    expect(typeof processor).toBe('function');
  });

  it('should return memorial processor for monument_photo sourceType', () => {
    const processor = getProcessor('monument_photo');
    expect(processor).toBeDefined();
    expect(typeof processor).toBe('function');
  });

  it('should return memorial processor for typographic_analysis sourceType', () => {
    const processor = getProcessor('typographic_analysis');
    expect(processor).toBeDefined();
    expect(typeof processor).toBe('function');
  });

  it('should return memorial processor for record_sheet sourceType', () => {
    const processor = getProcessor('record_sheet');
    expect(processor).toBeDefined();
    expect(typeof processor).toBe('function');
  });

  it('should return memorial processor for unknown sourceType', () => {
    const processor = getProcessor('unknown_type');
    expect(processor).toBeDefined();
    expect(typeof processor).toBe('function');
  });

  it('should return same processor instance for same sourceType', () => {
    const processor1 = getProcessor('memorial');
    const processor2 = getProcessor('memorial');
    expect(processor1).toBe(processor2);
  });
});
