/**
 * Target safety (spec T5.2, ADR 0007 point 7). Pure functions: nothing here opens a connection.
 * Agents and CI only ever use the local target; a remote run needs an explicit, matching project ref.
 */

export const LOCAL_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
export const REMOTE_ENV_VAR = 'FOOD_IMPORT_DATABASE_URL';
export const IMPORTER_ROLE = 'food_importer';

export class TargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TargetError';
  }
}

export type ResolvedTarget =
  | { kind: 'local'; connectionString: string; host: string }
  | { kind: 'remote'; connectionString: string; host: string; projectRef: string };

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

export function isLoopbackHost(host: string): boolean {
  return LOOPBACK.has(host.toLowerCase());
}

function parseUrl(raw: string, what: string): URL {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
      throw new Error('not a postgresql:// URL');
    }
    return url;
  } catch {
    // Never echo the value: it may contain a password.
    throw new TargetError(`${what} is not a valid postgresql:// URL`);
  }
}

/** Replaces the password with *** so a URL can be printed. */
export function redactUrl(raw: string): string {
  try {
    const url = new URL(raw);
    if (url.password) url.password = '***';
    return url.toString();
  } catch {
    return '(unparseable url)';
  }
}

export function assertLoopback(connectionString: string): void {
  const url = parseUrl(connectionString, 'local database URL');
  if (!isLoopbackHost(url.hostname)) {
    throw new TargetError(
      `--target local refuses non-loopback host "${url.hostname}". Use --target remote with --confirm-remote.`,
    );
  }
}

/**
 * Project ref from a Supabase connection URL:
 * - direct:  user food_importer,        host db.<ref>.supabase.co
 * - pooler:  user food_importer.<ref>,  host *.pooler.supabase.com
 */
export function parseRemoteUrl(raw: string): { host: string; projectRef: string; port: number } {
  const url = parseUrl(raw, REMOTE_ENV_VAR);
  const user = decodeURIComponent(url.username);
  const port = url.port ? Number(url.port) : 5432;
  if (port === 6543) {
    throw new TargetError(
      'port 6543 is the transaction pooler, which has no session advisory locks. Use the session pooler (5432) or a direct connection.',
    );
  }
  let projectRef: string | null = null;
  if (user === IMPORTER_ROLE) {
    const m = /^db\.([a-z0-9]{10,40})\.supabase\.co$/.exec(url.hostname);
    projectRef = m?.[1] ?? null;
    if (!projectRef) {
      throw new TargetError(
        `cannot derive the project ref from host "${url.hostname}" (expected db.<ref>.supabase.co for the direct connection)`,
      );
    }
  } else if (user.startsWith(`${IMPORTER_ROLE}.`)) {
    projectRef = user.slice(IMPORTER_ROLE.length + 1);
    if (!/^[a-z0-9]{10,40}$/.test(projectRef)) {
      throw new TargetError(`pooler user "${user}" does not end in a valid project ref`);
    }
  } else {
    throw new TargetError(
      `the remote user must be ${IMPORTER_ROLE} or ${IMPORTER_ROLE}.<project-ref>; refusing to connect as another role`,
    );
  }
  return { host: url.hostname, projectRef, port };
}

export interface TargetOptions {
  target: 'local' | 'remote';
  confirmRemote: string | null;
}

export function resolveTarget(
  opts: TargetOptions,
  env: Readonly<Record<string, string | undefined>>,
): ResolvedTarget {
  if (opts.target === 'local') {
    if (opts.confirmRemote !== null) {
      throw new TargetError('--confirm-remote only makes sense with --target remote');
    }
    assertLoopback(LOCAL_DATABASE_URL);
    return { kind: 'local', connectionString: LOCAL_DATABASE_URL, host: '127.0.0.1' };
  }

  const raw = env[REMOTE_ENV_VAR];
  if (!raw) {
    throw new TargetError(`--target remote needs ${REMOTE_ENV_VAR} in the environment`);
  }
  const { host, projectRef } = parseRemoteUrl(raw);
  if (opts.confirmRemote === null) {
    throw new TargetError(
      `--target remote needs --confirm-remote ${projectRef} (the project ref from ${REMOTE_ENV_VAR}), typed by the operator`,
    );
  }
  if (opts.confirmRemote !== projectRef) {
    throw new TargetError(
      `--confirm-remote "${opts.confirmRemote}" does not match the project ref in ${REMOTE_ENV_VAR}`,
    );
  }
  return { kind: 'remote', connectionString: raw, host, projectRef };
}

/**
 * Fault-injection hook for the interrupted-run test (AC 37). Honoured only against the local database;
 * setting it with a remote target is an error rather than a silent no-op.
 */
export function faultAfterBatches(
  env: Readonly<Record<string, string | undefined>>,
  target: ResolvedTarget,
): number | null {
  const raw = env['FOOD_IMPORT_FAULT_AFTER_BATCHES'];
  if (raw === undefined || raw === '') return null;
  if (target.kind !== 'local') {
    throw new TargetError('FOOD_IMPORT_FAULT_AFTER_BATCHES is only honoured with --target local');
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) {
    throw new TargetError('FOOD_IMPORT_FAULT_AFTER_BATCHES must be a non-negative integer');
  }
  return n;
}
