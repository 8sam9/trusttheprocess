import { describe, expect, it } from 'vitest';
import {
  LOCAL_DATABASE_URL,
  TargetError,
  assertLoopback,
  faultAfterBatches,
  parseRemoteUrl,
  redactUrl,
  resolveTarget,
} from './target.js';

const REF = 'abcdefghijklmnopqrst';
const DIRECT = `postgresql://food_importer:s3cret@db.${REF}.supabase.co:5432/postgres`;
const POOLER = `postgresql://food_importer.${REF}:s3cret@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`;

describe('target safety (T5.2)', () => {
  it('defaults to the loopback local stack', () => {
    const t = resolveTarget({ target: 'local', confirmRemote: null }, {});
    expect(t).toEqual({ kind: 'local', connectionString: LOCAL_DATABASE_URL, host: '127.0.0.1' });
  });

  it('local never reads the remote variable and refuses --confirm-remote', () => {
    const t = resolveTarget(
      { target: 'local', confirmRemote: null },
      { FOOD_IMPORT_DATABASE_URL: DIRECT },
    );
    expect(t.connectionString).toBe(LOCAL_DATABASE_URL);
    expect(() => resolveTarget({ target: 'local', confirmRemote: REF }, {})).toThrow(TargetError);
  });

  it('refuses a non-loopback host for the local target', () => {
    expect(() => assertLoopback('postgresql://postgres:postgres@10.0.0.5:54322/postgres')).toThrow(
      /non-loopback/,
    );
    expect(() =>
      assertLoopback('postgresql://postgres:postgres@localhost:54322/postgres'),
    ).not.toThrow();
  });

  it('remote needs the env var', () => {
    expect(() => resolveTarget({ target: 'remote', confirmRemote: REF }, {})).toThrow(
      /FOOD_IMPORT_DATABASE_URL/,
    );
  });

  it('remote needs --confirm-remote equal to the ref in the URL (direct and pooler forms)', () => {
    for (const url of [DIRECT, POOLER]) {
      const env = { FOOD_IMPORT_DATABASE_URL: url };
      expect(() => resolveTarget({ target: 'remote', confirmRemote: null }, env)).toThrow(
        /--confirm-remote/,
      );
      expect(() =>
        resolveTarget({ target: 'remote', confirmRemote: 'otherprojectref' }, env),
      ).toThrow(/does not match/);
      const t = resolveTarget({ target: 'remote', confirmRemote: REF }, env);
      expect(t.kind).toBe('remote');
      if (t.kind === 'remote') expect(t.projectRef).toBe(REF);
    }
  });

  it('refuses the transaction pooler (port 6543)', () => {
    const url = POOLER.replace(':5432/', ':6543/');
    expect(() => parseRemoteUrl(url)).toThrow(/6543/);
  });

  it('refuses any role other than food_importer, including postgres and the service role', () => {
    expect(() =>
      parseRemoteUrl(`postgresql://postgres:pw@db.${REF}.supabase.co:5432/postgres`),
    ).toThrow(/food_importer/);
    expect(() =>
      parseRemoteUrl(
        `postgresql://postgres.${REF}:pw@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`,
      ),
    ).toThrow(/food_importer/);
    expect(() =>
      parseRemoteUrl(`postgresql://food_importerx:pw@db.${REF}.supabase.co:5432/postgres`),
    ).toThrow(/food_importer/);
  });

  it('refuses a direct host that is not db.<ref>.supabase.co and non-postgres URLs', () => {
    expect(() => parseRemoteUrl('postgresql://food_importer:pw@example.com:5432/postgres')).toThrow(
      /project ref/,
    );
    expect(() => parseRemoteUrl('https://example.com')).toThrow(/postgresql/);
  });

  it('error messages never contain the password', () => {
    const bad = `postgresql://food_importer:hunter2@evil.example.com:5432/postgres`;
    try {
      parseRemoteUrl(bad);
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as Error).message).not.toContain('hunter2');
    }
    expect(() => parseRemoteUrl('nonsense hunter2')).toThrow(TargetError);
    expect(redactUrl(DIRECT)).not.toContain('s3cret');
    expect(redactUrl(DIRECT)).toContain('***');
  });

  it('fault injection is honoured only with the local target', () => {
    const local = resolveTarget({ target: 'local', confirmRemote: null }, {});
    const remote = resolveTarget(
      { target: 'remote', confirmRemote: REF },
      { FOOD_IMPORT_DATABASE_URL: DIRECT },
    );
    expect(faultAfterBatches({}, local)).toBeNull();
    expect(faultAfterBatches({ FOOD_IMPORT_FAULT_AFTER_BATCHES: '3' }, local)).toBe(3);
    expect(() => faultAfterBatches({ FOOD_IMPORT_FAULT_AFTER_BATCHES: '3' }, remote)).toThrow(
      TargetError,
    );
    expect(() => faultAfterBatches({ FOOD_IMPORT_FAULT_AFTER_BATCHES: 'x' }, local)).toThrow(
      TargetError,
    );
  });
});
