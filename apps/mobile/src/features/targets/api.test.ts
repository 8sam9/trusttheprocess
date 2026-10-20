import { ApplyValidationError, toSaveFailure } from './api';

describe('toSaveFailure (AC 29)', () => {
  it('maps supabase-js network failures to offline', () => {
    expect(
      toSaveFailure({ code: '', message: 'TypeError: Failed to fetch', details: '', hint: '' }),
    ).toBe('offline');
    expect(toSaveFailure({ code: '', message: 'TypeError: Network request failed' })).toBe(
      'offline',
    );
    expect(toSaveFailure(new TypeError('Load failed'))).toBe('offline');
  });

  it('maps RPC rule violations to validation, but not-authenticated to server', () => {
    for (const message of [
      'under_min_age',
      'invalid_input',
      'lose_goal_unavailable',
      'below_floor',
      'above_cap',
      'macro_mismatch',
      'consent_required',
    ]) {
      expect(toSaveFailure({ code: 'P0001', message })).toBe('validation');
    }
    expect(toSaveFailure({ code: 'P0001', message: 'not_authenticated' })).toBe('server');
    expect(toSaveFailure({ code: 'P0001', message: 'something else' })).toBe('server');
  });

  it('maps check violations and bad enum values to validation', () => {
    expect(toSaveFailure({ code: '23514', message: 'new row violates check constraint' })).toBe(
      'validation',
    );
    expect(toSaveFailure({ code: '22P02', message: 'invalid input value for enum' })).toBe(
      'validation',
    );
  });

  it('maps client-side rule failures to validation and everything else to server', () => {
    expect(toSaveFailure(new ApplyValidationError('below_floor'))).toBe('validation');
    expect(toSaveFailure({ code: '500', message: 'boom' })).toBe('server');
    expect(toSaveFailure({ code: '42501', message: 'permission denied' })).toBe('server');
    expect(toSaveFailure(undefined)).toBe('server');
    expect(toSaveFailure('x')).toBe('server');
  });
});
