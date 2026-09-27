const { parseBurialDate } = require('../../src/utils/historicalDateParser');

describe('historicalDateParser.parseBurialDate()', () => {
  describe('Latin month abbreviations', () => {
    test('parses 7ber as September', () => {
      const result = parseBurialDate('7ber 1712');
      expect(result).toEqual({
        normalizedDate: 'Sep 1712',
        normalizedYear: 1712,
        warnings: []
      });
    });

    test('parses 8ber as October', () => {
      const result = parseBurialDate('8ber 1749');
      expect(result).toEqual({
        normalizedDate: 'Oct 1749',
        normalizedYear: 1749,
        warnings: []
      });
    });

    test('parses 9ber as November', () => {
      const result = parseBurialDate('9ber 1680');
      expect(result).toEqual({
        normalizedDate: 'Nov 1680',
        normalizedYear: 1680,
        warnings: []
      });
    });

    test('parses Xber as December', () => {
      const result = parseBurialDate('Xber 1749');
      expect(result).toEqual({
        normalizedDate: 'Dec 1749',
        normalizedYear: 1749,
        warnings: []
      });
    });

    test('parses 10ber as December', () => {
      const result = parseBurialDate('10ber 1700');
      expect(result).toEqual({
        normalizedDate: 'Dec 1700',
        normalizedYear: 1700,
        warnings: []
      });
    });

    test('does not misinterpret 7th as September', () => {
      const result = parseBurialDate('7th January 1803');
      expect(result).toEqual({
        normalizedDate: '7th January 1803',
        normalizedYear: 1803,
        warnings: []
      });
    });
  });

  describe('Dual-dated years (OS/NS boundary)', () => {
    test('parses Jan 1723/4 with OS correction', () => {
      const result = parseBurialDate('Jan 1723/4');
      expect(result).toEqual({
        normalizedDate: 'Jan 1724',
        normalizedYear: 1724,
        warnings: ['OLD_STYLE_YEAR_CORRECTED: Jan 1723/4 adjusted from Old Style to Gregorian year 1724']
      });
    });

    test('parses 25 Feb 1723/24 with OS correction', () => {
      const result = parseBurialDate('25 Feb 1723/24');
      expect(result).toEqual({
        normalizedDate: '25 Feb 1724',
        normalizedYear: 1724,
        warnings: ['OLD_STYLE_YEAR_CORRECTED: 25 Feb 1723/24 adjusted from Old Style to Gregorian year 1724']
      });
    });

    test('parses 1 Mar 1749/50 with OS correction', () => {
      const result = parseBurialDate('1 Mar 1749/50');
      expect(result).toEqual({
        normalizedDate: '1 Mar 1750',
        normalizedYear: 1750,
        warnings: ['OLD_STYLE_YEAR_CORRECTED: 1 Mar 1749/50 adjusted from Old Style to Gregorian year 1750']
      });
    });
  });

  describe('OS year-start correction (Jan-24 Mar, pre-1752, no dual-date)', () => {
    test('corrects 15 Feb 1720 to 1721', () => {
      const result = parseBurialDate('15 Feb 1720');
      expect(result).toEqual({
        normalizedDate: '15 Feb 1721',
        normalizedYear: 1721,
        warnings: ['OLD_STYLE_YEAR_CORRECTED: 15 Feb 1720 is before Lady Day; adjusted to Gregorian year 1721']
      });
    });

    test('corrects 24 Mar 1720 to 1721', () => {
      const result = parseBurialDate('24 Mar 1720');
      expect(result).toEqual({
        normalizedDate: '24 Mar 1721',
        normalizedYear: 1721,
        warnings: ['OLD_STYLE_YEAR_CORRECTED: 24 Mar 1720 is before Lady Day; adjusted to Gregorian year 1721']
      });
    });

    test('does NOT correct 25 Mar 1720 (Lady Day is the new year)', () => {
      const result = parseBurialDate('25 Mar 1720');
      expect(result).toEqual({
        normalizedDate: '25 Mar 1720',
        normalizedYear: 1720,
        warnings: []
      });
    });

    test('does NOT correct April 1720 (after Lady Day)', () => {
      const result = parseBurialDate('April 1720');
      expect(result).toEqual({
        normalizedDate: 'April 1720',
        normalizedYear: 1720,
        warnings: []
      });
    });

    test('does NOT correct January 1752 (cutoff year)', () => {
      const result = parseBurialDate('15 Jan 1752');
      expect(result).toEqual({
        normalizedDate: '15 Jan 1752',
        normalizedYear: 1752,
        warnings: []
      });
    });
  });

  describe('Edge cases / passthrough', () => {
    test('passes through post-1752 dates unchanged', () => {
      const result = parseBurialDate('8th March 1847');
      expect(result).toEqual({
        normalizedDate: '8th March 1847',
        normalizedYear: 1847,
        warnings: []
      });
    });

    test('extracts year from year-only string', () => {
      const result = parseBurialDate('1847');
      expect(result).toEqual({
        normalizedDate: null,
        normalizedYear: 1847,
        warnings: []
      });
    });

    test('silently returns nulls for unparseable string', () => {
      const result = parseBurialDate('unknown');
      expect(result).toEqual({
        normalizedDate: null,
        normalizedYear: null,
        warnings: []
      });
    });

    test('silently returns nulls for null input', () => {
      const result = parseBurialDate(null);
      expect(result).toEqual({
        normalizedDate: null,
        normalizedYear: null,
        warnings: []
      });
    });

    test('silently returns nulls for empty string', () => {
      const result = parseBurialDate('');
      expect(result).toEqual({
        normalizedDate: null,
        normalizedYear: null,
        warnings: []
      });
    });

    test('silently returns nulls for undefined', () => {
      const result = parseBurialDate(undefined);
      expect(result).toEqual({
        normalizedDate: null,
        normalizedYear: null,
        warnings: []
      });
    });
  });
});
