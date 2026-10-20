import { copy } from './copy';
import { emptyDraft, type TargetsDraft } from './draft';
import { validateAbout, validateBirthYear, validatePace } from './validate';

const NOW = new Date('2026-10-20T10:00:00Z');
const draft = (over: Partial<TargetsDraft>): TargetsDraft => ({
  ...emptyDraft('metric', 0),
  sex: 'female',
  birthYear: '1996',
  heightCm: '165',
  weight: '65',
  ...over,
});
const errors = (d: TargetsDraft) => {
  const r = validateAbout(d, NOW);
  return r.ok ? {} : r.errors;
};

describe('birth year (AC 12, 13)', () => {
  it.each([
    ['', copy.errYearMissing],
    ['94', copy.errYearMalformed],
    ['19a4', copy.errYearMalformed],
    ['2027', copy.errYearMalformed],
    ['1900', copy.errYearEarly(1916)],
  ])('%j gives a specific message', (text, message) => {
    expect(validateBirthYear(text, NOW).error).toBe(message);
  });

  it('treats 2011 as 15 (blocked) and 2010 as 16 (allowed)', () => {
    expect(validateBirthYear('2011', NOW)).toMatchObject({ underage: true, error: null });
    expect(validateBirthYear('2010', NOW)).toMatchObject({
      underage: false,
      error: null,
      year: 2010,
    });
    expect(validateBirthYear('1916', NOW)).toMatchObject({ error: null, year: 1916 });
    expect(validateBirthYear('1915', NOW).error).toBe(copy.errYearEarly(1916));
  });
});

describe('About you validation (AC 13, 14)', () => {
  it('accepts the worked example', () => {
    expect(validateAbout(draft({}), NOW)).toEqual({
      ok: true,
      value: { sex: 'female', birthYear: 1996, heightCm: 165, weightKg: 65 },
    });
  });

  it('reports missing answers in field order', () => {
    const r = validateAbout(draft({ sex: null, birthYear: '', heightCm: '', weight: '' }), NOW);
    expect(r).toMatchObject({
      ok: false,
      first: 'sex',
      errors: {
        sex: copy.errSex,
        birthYear: copy.errYearMissing,
        height: copy.errHeightMissing,
        weight: copy.errWeightMissing,
      },
    });
  });

  it.each([
    ['99', copy.errHeightMetric],
    ['251', copy.errHeightMetric],
  ])('metric height %s is out of range', (heightCm, message) => {
    expect(errors(draft({ heightCm })).height).toBe(message);
  });
  it('accepts the metric limits', () => {
    expect(validateAbout(draft({ heightCm: '100', weight: '30' }), NOW).ok).toBe(true);
    expect(validateAbout(draft({ heightCm: '250', weight: '350' }), NOW).ok).toBe(true);
  });
  it.each(['29', '351'])('metric weight %s is out of range', (weight) => {
    expect(errors(draft({ weight })).weight).toBe(copy.errWeightMetric);
  });

  const imperial = (over: Partial<TargetsDraft>) =>
    draft({
      units: 'imperial',
      heightCm: '',
      heightFt: '5',
      heightIn: '5',
      weight: '143',
      ...over,
    });

  it('converts imperial entry to metric', () => {
    const r = validateAbout(imperial({}), NOW);
    expect(r).toMatchObject({ ok: true, value: { heightCm: 165.1, weightKg: 64.86 } });
  });
  it('limits are the ones the copy states: 3 ft 4 in to 8 ft 2 in, 67 to 771 lb', () => {
    expect(validateAbout(imperial({ heightFt: '3', heightIn: '4', weight: '67' }), NOW).ok).toBe(
      true,
    );
    expect(validateAbout(imperial({ heightFt: '8', heightIn: '2', weight: '771' }), NOW).ok).toBe(
      true,
    );
    expect(errors(imperial({ heightFt: '3', heightIn: '3' })).height).toBe(copy.errHeightImperial);
    expect(errors(imperial({ heightFt: '8', heightIn: '3' })).height).toBe(copy.errHeightImperial);
    expect(errors(imperial({ weight: '66' })).weight).toBe(copy.errWeightImperial);
    expect(errors(imperial({ weight: '772' })).weight).toBe(copy.errWeightImperial);
  });
  it('inches go from 0 to 11, and empty inches count as 0', () => {
    expect(errors(imperial({ heightIn: '12' })).heightIn).toBe(copy.errInches);
    expect(validateAbout(imperial({ heightFt: '5', heightIn: '0' }), NOW).ok).toBe(true);
    expect(validateAbout(imperial({ heightFt: '5', heightIn: '' }), NOW).ok).toBe(true);
    expect(errors(imperial({ heightFt: '', heightIn: '' })).height).toBe(copy.errHeightMissing);
  });
  it('accepts a comma as the decimal separator (Android decimal pads)', () => {
    expect(validateAbout(draft({ weight: '64,5' }), NOW)).toMatchObject({
      ok: true,
      value: { weightKg: 64.5 },
    });
  });

  it('an under-16 year wins over every other problem and carries no field errors', () => {
    expect(validateAbout(draft({ birthYear: '2015', heightCm: '' }), NOW)).toEqual({
      ok: false,
      underage: true,
      errors: {},
      first: 'birthYear',
    });
  });
});

describe('pace validation (AC 33)', () => {
  const presets = () => 0.5;
  const custom = (text: string, units: 'metric' | 'imperial' = 'metric') =>
    validatePace({ kind: 'custom', text }, units, presets);

  it.each(['0.009', '0', '1.51', 'abc', ''])('%j is outside 0.01 to 1.5 kg', (text) => {
    expect(custom(text)).toEqual({ error: copy.paceCustomError('metric'), kg: null });
  });
  it.each([
    ['0.01', 0.01],
    ['0.75', 0.75],
    ['0.76', 0.76],
    ['1.5', 1.5],
    ['1,2', 1.2],
  ])('%s is accepted as %s kg', (text, kg) => {
    expect(custom(text)).toEqual({ error: null, kg });
  });
  it('imperial entry is converted to kg with 2 decimals, and the error is in lb', () => {
    expect(custom('1', 'imperial').kg).toBe(0.45);
    expect(custom('3.3', 'imperial').kg).toBe(1.5);
    expect(custom('0.02', 'imperial').kg).toBe(0.01);
    expect(custom('0.01', 'imperial').error).toBe(copy.paceCustomError('imperial'));
    expect(custom('3.4', 'imperial').error).toBe(copy.paceCustomError('imperial'));
    expect(copy.paceCustomError('imperial')).toContain('lb');
  });
  it('uses the preset kg for presets', () => {
    expect(validatePace({ kind: 'preset', id: 'moderate' }, 'metric', presets)).toEqual({
      error: null,
      kg: 0.5,
    });
  });
});
