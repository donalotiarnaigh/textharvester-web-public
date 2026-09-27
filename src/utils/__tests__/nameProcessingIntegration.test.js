/**
 * Integration tests for name processing utilities
 */

const {
  preprocessName,
  formatName
} = require('../nameProcessing');

describe('Name Processing Integration Tests', () => {
  it('should process and format complete names correctly', () => {
    // Test case 1: Standard name
    const name1 = preprocessName('John Smith');
    expect(formatName(name1.firstName, name1.lastName, name1.prefix, name1.suffix)).toEqual({
      first_name: 'JOHN',
      last_name: 'SMITH'
    });

    // Test case 2: Name with prefix and suffix
    const name2 = preprocessName('Rev. John Smith Jr.');
    expect(formatName(name2.firstName, name2.lastName, name2.prefix, name2.suffix)).toEqual({
      first_name: 'JOHN',
      last_name: 'SMITH',
      prefix: 'REV.',
      suffix: 'JR.'
    });

    // Test case 3: Name with initials
    const name3 = preprocessName('J.R. Smith');
    expect(formatName(name3.firstName, name3.lastName, name3.prefix, name3.suffix)).toEqual({
      first_name: 'J.R.',
      last_name: 'SMITH'
    });

    // Test case 4: Compound last name
    const name4 = preprocessName('John van der Waals');
    expect(formatName(name4.firstName, name4.lastName, name4.prefix, name4.suffix)).toEqual({
      first_name: 'JOHN',
      last_name: 'VAN DER WAALS'
    });

    // Test case 5: Problematic case
    const name5 = preprocessName('R.R Talbot Junr');
    expect(formatName(name5.firstName, name5.lastName, name5.prefix, name5.suffix)).toEqual({
      first_name: 'R.R.',
      last_name: 'TALBOT',
      suffix: 'JUNR'
    });
  });

  it('should handle edge cases gracefully', () => {
    // Empty name
    const emptyName = preprocessName('');
    expect(formatName(emptyName.firstName, emptyName.lastName, emptyName.prefix, emptyName.suffix)).toEqual({
      first_name: '',
      last_name: ''
    });

    // Single word name
    const singleName = preprocessName('Smith');
    expect(formatName(singleName.firstName, singleName.lastName, singleName.prefix, singleName.suffix)).toEqual({
      first_name: '',
      last_name: 'SMITH'
    });

    // Multiple spaces and casing issues
    const messyName = preprocessName('   joHn    sMiTh   ');
    expect(formatName(messyName.firstName, messyName.lastName, messyName.prefix, messyName.suffix)).toEqual({
      first_name: 'JOHN',
      last_name: 'SMITH'
    });

    // Mixed initials and name
    const mixedName = preprocessName('J. Robert Smith');
    expect(formatName(mixedName.firstName, mixedName.lastName, mixedName.prefix, mixedName.suffix)).toEqual({
      first_name: 'J. ROBERT',
      last_name: 'SMITH'
    });
  });

  it('should handle name variations for the same person', () => {
    // Different representations of the same person
    const versions = [
      'Rev. John Smith Jr.',
      'John Smith Jr',
      'Rev John Smith, Jr',
      'Rev. J. Smith Jr.'
    ];

    // Extract last names for all versions - they should match
    const lastNames = versions.map(name => {
      const processed = preprocessName(name);
      return processed.lastName;
    });

    // All last names should be the same
    lastNames.forEach(lastName => {
      expect(lastName).toBe('SMITH');
    });

    // All should have a suffix (though formatting might vary)
    const allHaveSuffix = versions.every(name => {
      const processed = preprocessName(name);
      return processed.suffix !== null;
    });

    expect(allHaveSuffix).toBe(true);
  });
}); 