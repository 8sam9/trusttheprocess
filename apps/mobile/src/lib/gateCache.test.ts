import { authStorage } from './authStorage';
import { gateCache } from './gateCache';

const targets = {
  effective_from: '2026-10-19',
  kcal: 1330,
  protein_g: 104,
  carbs_g: 129,
  fat_g: 44,
  is_custom: false,
  floor_applied: false,
};

beforeEach(() => authStorage?.clear());

describe('gateCache', () => {
  it('returns null when nothing is cached', () => {
    expect(gateCache.read('u1')).toBeNull();
  });

  it('round-trips the flag and a targets summary', () => {
    gateCache.update(
      'u1',
      { onboardingCompleted: true, targets },
      new Date('2026-10-20T08:00:00Z'),
    );
    expect(gateCache.read('u1')).toEqual({
      v: 1,
      onboardingCompleted: true,
      targets,
      cachedAt: '2026-10-20T08:00:00.000Z',
    });
  });

  it('merges patches: the flag survives a targets update and vice versa', () => {
    gateCache.update('u1', { onboardingCompleted: true });
    gateCache.update('u1', { targets });
    expect(gateCache.read('u1')).toMatchObject({ onboardingCompleted: true, targets });
    gateCache.update('u1', { onboardingCompleted: false });
    expect(gateCache.read('u1')).toMatchObject({ onboardingCompleted: false, targets });
  });

  it('is namespaced per user', () => {
    gateCache.update('u1', { onboardingCompleted: true });
    expect(gateCache.read('u2')).toBeNull();
    gateCache.clear('u2');
    expect(gateCache.read('u1')?.onboardingCompleted).toBe(true);
    gateCache.clear('u1');
    expect(gateCache.read('u1')).toBeNull();
  });

  it.each(['not json', '{"v":2}', '{"v":1,"onboardingCompleted":"yes"}', 'null', '[]'])(
    'ignores a corrupt value: %s',
    (raw) => {
      authStorage?.setItem('ttp:v1:gate:u1', raw);
      expect(gateCache.read('u1')).toBeNull();
    },
  );

  it('stores no body stats, only flags and the targets summary', () => {
    gateCache.update('u1', { onboardingCompleted: true, targets });
    const raw = authStorage?.getItem('ttp:v1:gate:u1') ?? '';
    for (const forbidden of ['height', 'weight', 'birth', 'sex', 'activity', 'email']) {
      expect(raw).not.toContain(forbidden);
    }
  });

  it('tracks a pending under-16 reset separately', () => {
    expect(gateCache.hasPendingUnderageReset('u1')).toBe(false);
    gateCache.setPendingUnderageReset('u1');
    expect(gateCache.hasPendingUnderageReset('u1')).toBe(true);
    expect(gateCache.hasPendingUnderageReset('u2')).toBe(false);
    gateCache.clearPendingUnderageReset('u1');
    expect(gateCache.hasPendingUnderageReset('u1')).toBe(false);
  });
});

describe('gateCache.clear (sign-out and account deletion)', () => {
  it('removes the gate value and the pending under-16 reset flag of that user only', () => {
    gateCache.update('u1', { onboardingCompleted: true, targets });
    gateCache.setPendingUnderageReset('u1');
    gateCache.update('u2', { onboardingCompleted: true });
    gateCache.setPendingUnderageReset('u2');
    gateCache.clear('u1');
    expect(gateCache.read('u1')).toBeNull();
    expect(gateCache.hasPendingUnderageReset('u1')).toBe(false);
    expect(gateCache.read('u2')).not.toBeNull();
    expect(gateCache.hasPendingUnderageReset('u2')).toBe(true);
  });
});
