import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { UsageError, USAGE, parseCli } from './args.js';
import { ConfigError, loadConfig } from './config.js';
import { DEFAULT_OFF_DUMP_URL, DownloadError, downloadFile, assertAllowedUrl } from './download.js';
import { TargetError, resolveTarget } from './target.js';

async function toolVersion(): Promise<string> {
  const pkg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
  const parsed = JSON.parse(await readFile(pkg, 'utf8')) as { version: string };
  return parsed.version;
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
    loadConfig(); // fail early on a broken config, before any file or database is touched

    switch (cmd.command) {
      case 'download': {
        const url = cmd.url ?? (cmd.dataset === 'off' ? DEFAULT_OFF_DUMP_URL : null);
        if (url === null) {
          throw new UsageError(
            `download: ${cmd.dataset} file names carry the release date, so pass --url <https://fdc.nal.usda.gov/...> from the official download page`,
          );
        }
        const fileName = path.basename(assertAllowedUrl(url).pathname) || `${cmd.dataset}.download`;
        await mkdir(cmd.out, { recursive: true });
        const { bytes } = await downloadFile({
          url,
          dataset: cmd.dataset,
          outPath: path.join(cmd.out, fileName),
          version: await toolVersion(),
          contact: env['FOOD_IMPORT_CONTACT'],
        });
        out(`downloaded ${fileName} (${bytes} bytes) to ${cmd.out}`);
        return 0;
      }
      case 'import':
      case 'release-check': {
        // Validate the target now so unsafe invocations are refused even before the engine exists.
        resolveTarget({ target: cmd.target, confirmRemote: cmd.confirmRemote }, env);
        err(`${cmd.command}: the import engine is not built yet (task B6).`);
        return 2;
      }
      case 'load-fixture':
      case 'cut-fixture':
        err(`${cmd.command}: not built yet (tasks B6 and B7).`);
        return 2;
    }
  } catch (e) {
    if (
      e instanceof UsageError ||
      e instanceof TargetError ||
      e instanceof ConfigError ||
      e instanceof DownloadError
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
