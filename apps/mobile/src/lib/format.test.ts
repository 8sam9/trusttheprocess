import {
  formatDayMonthYear,
  formatInt,
  formatSigned,
  formatWeekdayDay,
  sentenceCase,
  spokenSigned,
} from './format';

describe('format', () => {
  it('uses thousands separators and a real minus sign', () => {
    expect(formatInt(1330)).toBe('1,330');
    expect(formatSigned(-550)).toBe('−550');
    expect(formatSigned(275)).toBe('+275');
    expect(formatSigned(0)).toBe('0');
  });
  it('reads signs as words for screen readers', () => {
    expect(spokenSigned(-550)).toBe('minus 550');
    expect(spokenSigned(1275)).toBe('plus 1,275');
    expect(spokenSigned(0)).toBe('0');
  });
  it('formats calendar dates as written, with no time zone shift', () => {
    expect(formatDayMonthYear('2026-10-19')).toBe('19 Oct 2026');
    expect(formatWeekdayDay('2026-10-19')).toBe('Mon 19 Oct');
    expect(formatDayMonthYear('nonsense')).toBe('nonsense');
  });
  it('sentence-cases card titles', () => {
    expect(sentenceCase('LOSE FAT')).toBe('Lose fat');
  });
});
