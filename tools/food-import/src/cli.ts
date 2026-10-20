import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { UsageError, USAGE, parseCli, DEFAULT_REPORT_DIR } from './args.js';
import { ConfigError, loadConfig } from './config.js';
import { DEFAULT_OFF_DUMP_URL, DownloadError, downloadFile, assertAllowedUrl } from './download.js';
import { formatReport } from './engine/print.js';
import { FaultInjectedError, ImportError } from './engine/errors.js';
import { runImport } from './engine/run.js';
import { cutFixture } from './fixture/cut.js';
import { FIXTURE_IDS_FILE, FIXTURE_MANIFEST_V1, TOOL_DIR } from './fixture/paths.js';
import { goldenCheck, sizeCheck } from './fixture/release-check.js';
import { TargetError, faultAfterBatches, redactUrl, resolveTarget } from './target.js';

async function toolVersion(): Promise<string> {
  const pkg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
  const parsed = JSON.parse(await readFile(pkg, 'utf8')) as { version: string };
  return parsed.version;
}

/**
 * `pnpm food:*` runs inside the package folder, so a relative path typed at the repository root would not resolve.
 * pnpm sets INIT_CWD to the folder the command was typed in; use it as the base for relative paths.
 */
function userPath(p: string, env: Readonly<Record<string, string | undefined>>): string {
  return path.resolve(env['INIT_CWD'] ?? process.cwd(), p);
}

/** Returns the process exit code. Messages name the problem and the next step (spec section 7). */
export async function main(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>> = process.env,
  out: (line: string) => void = (line) => console.log(line),
  err: (line: string) => void = (line) => console.error(line),
): Promise<number> {
  try {
    const cmd = parseCli(argv);
    if (cmd.command === 'help') {
      out(USAGE);
      return 0;
    }
    const config = loadConfig(); // fail early on a broken config, before any file or database is touched

    switch (cmd.command) {
      case 'download': {
        const url = cmd.url ?? (cmd.dataset === 'off' ? DEFAULT_OFF_DUMP_URL : null);
        if (url === null) {
          throw new UsageError(
            `download: ${cmd.dataset} file names carry the release date, so pass --url <https://fdc.nal.usda.gov/...> from the official download page`,
          );
        }
        const fileName = path.basename(assertAllowedUrl(url).pathname) || `${cmd.dataset}.download`;
        const dir = userPath(cmd.out, env);
        await mkdir(dir, { recursive: true });
        const { bytes } = await downloadFile({
          url,
          dataset: cmd.dataset,
          outPath: path.join(dir, fileName),
          version: await toolVersion(),
          contact: env['FOOD_IMPORT_CONTACT'],
        });
        out(`downloaded ${fileName} (${bytes} bytes) to ${dir}`);
        return 0;
      }
      case 'import':
      case 'load-fixture': {
        const isLoad = cmd.command === 'load-fixture';
        const target = resolveTarget(
          isLoad
            ? { target: 'local', confirmRemote: null }
            : { target: cmd.target, confirmRemote: cmd.confirmRemote },
          env,
        );
        const apply = isLoad ? true : cmd.apply;
        const fault = faultAfterBatches(env, target);
        out(
          `${apply ? 'Applying' : 'Dry run of'} the import on ${target.kind} database ${redactUrl(target.connectionString)}`,
        );
        const report = await runImport({
          manifestPath: isLoad ? FIXTURE_MANIFEST_V1 : userPath(cmd.manifest, env),
          apply,
          connectionString: target.connectionString,
          allowMassRemoval: isLoad ? false : cmd.allowMassRemoval,
          reportDir:
            !isLoad && cmd.reportDir !== DEFAULT_REPORT_DIR
              ? userPath(cmd.reportDir, env)
              : path.join(TOOL_DIR, '.reports'),
          throttleMs: isLoad ? 0 : cmd.throttleMs,
          toolVersion: await toolVersion(),
          faultAfterBatches: fault,
          config,
          log: out,
        });
        for (const line of formatReport(report)) out(line);
        if (report.run.status === 'aborted') {
          err(`error: ${report.run.failureReason ?? 'run aborted'}`);
          return 3;
        }
        if (report.run.status === 'failed') {
          err(`error: ${report.run.failureReason ?? 'run failed'}`);
          return 4;
        }
        if (report.run.dryRun) out('Dry run only. Add --apply to write.');
        return 0;
      }
      case 'release-check': {
        const target = resolveTarget({ target: cmd.target, confirmRemote: cmd.confirmRemote }, env);
        const db = new pg.Client({ connectionString: target.connectionString });
        try {
          await db.connect();
        } catch (e) {
          throw new ImportError(
            'database',
            `cannot connect to the database: ${(e as Error).message}`,
          );
        }
        let ok = true;
        try {
          for (const check of cmd.checks) {
            if (check === 'italian-barcodes') {
              err('release-check italian-barcodes: not built yet (spec 002b, task B14).');
              ok = false;
              continue;
            }
            const result =
              check === 'golden' ? await goldenCheck(db) : await sizeCheck(db, config.budget);
            for (const line of result.lines) out(line);
            ok = ok && result.ok;
          }
        } finally {
          await db.end();
        }
        out(ok ? 'release-check: PASS' : 'release-check: FAIL');
        return ok ? 0 : 1;
      }
      case 'cut-fixture': {
        const result = await cutFixture({
          from: cmd.from === null ? null : userPath(cmd.from, env),
          idsFile: cmd.ids === null ? FIXTURE_IDS_FILE : userPath(cmd.ids, env),
          rules: config.rules,
          version: await toolVersion(),
          contact: env['FOOD_IMPORT_CONTACT'],
          log: out,
        }).catch((e: unknown) => {
          throw new ImportError('bad_input', e instanceof Error ? e.message : String(e));
        });
        for (const line of result.lines) out(line);
        return result.needsAttention ? 3 : 0;
      }
    }
  } catch (e) {
    if (e instanceof FaultInjectedError) {
      err(`error: ${e.message}`);
      return 5;
    }
    if (
      e instanceof UsageError ||
      e instanceof TargetError ||
      e instanceof ConfigError ||
      e instanceof DownloadError ||
      e instanceof ImportError
    ) {
      err(`error: ${e.message}`);
      return e instanceof UsageError ? 64 : 1;
    }
    throw e;
  }
}

if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (e: unknown) => {
      console.error(e instanceof Error ? `fatal: ${e.message}` : 'fatal error');
      process.exitCode = 1;
    },
  );
}
