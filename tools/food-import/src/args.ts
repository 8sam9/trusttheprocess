import { parseArgs } from 'node:util';
import { FoodDataset } from '@ttp/shared';

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

export const COMMANDS = [
  'import',
  'load-fixture',
  'cut-fixture',
  'release-check',
  'download',
] as const;
export type Command = (typeof COMMANDS)[number];

export const RELEASE_CHECKS = ['golden', 'italian-barcodes', 'size'] as const;
export type ReleaseCheck = (typeof RELEASE_CHECKS)[number];

export type ParsedCommand =
  | {
      command: 'import';
      manifest: string;
      apply: boolean;
      target: 'local' | 'remote';
      confirmRemote: string | null;
      allowMassRemoval: boolean;
      reportDir: string;
      throttleMs: number;
    }
  | { command: 'load-fixture' }
  | { command: 'cut-fixture'; from: string; ids: string }
  | {
      command: 'release-check';
      checks: ReleaseCheck[];
      target: 'local' | 'remote';
      confirmRemote: string | null;
    }
  | { command: 'download'; dataset: FoodDataset; out: string; url: string | null }
  | { command: 'help' };

export const DEFAULT_REPORT_DIR = 'tools/food-import/.reports';

export const USAGE = `Usage: food-import <command> [options]

  import         --manifest <file.json> [--apply] [--target local|remote] [--confirm-remote <project-ref>]
                 [--allow-mass-removal] [--report-dir <dir>] [--throttle-ms <n>]
  load-fixture   Import the checked-in fixture into the local database (needs no network)
  cut-fixture    --from <dir of real downloads> --ids <fixture-ids.json>   (operator only)
  release-check  --checks golden,italian-barcodes,size [--target local|remote] [--confirm-remote <ref>]
  download       --dataset <name> --out <dir> [--url <https url>]   (official hosts only)

Without --apply every import is a dry run. Remote runs need FOOD_IMPORT_DATABASE_URL and a matching --confirm-remote.`;

function need(value: string | undefined, flag: string, command: string): string {
  if (value === undefined || value === '') throw new UsageError(`${command}: ${flag} is required`);
  return value;
}

function parseTarget(value: string | undefined): 'local' | 'remote' {
  const v = value ?? 'local';
  if (v !== 'local' && v !== 'remote')
    throw new UsageError(`--target must be local or remote, got "${v}"`);
  return v;
}

export function parseCli(argv: readonly string[]): ParsedCommand {
  const [command, ...rest] = argv;
  if (command === undefined || command === 'help' || command === '--help' || command === '-h') {
    return { command: 'help' };
  }
  if (!(COMMANDS as readonly string[]).includes(command)) {
    throw new UsageError(`unknown command "${command}"`);
  }

  let values;
  try {
    ({ values } = parseArgs({
      args: [...rest],
      allowPositionals: false,
      strict: true,
      options: {
        manifest: { type: 'string' },
        apply: { type: 'boolean' },
        target: { type: 'string' },
        'confirm-remote': { type: 'string' },
        'allow-mass-removal': { type: 'boolean' },
        'report-dir': { type: 'string' },
        'throttle-ms': { type: 'string' },
        from: { type: 'string' },
        ids: { type: 'string' },
        checks: { type: 'string' },
        dataset: { type: 'string' },
        out: { type: 'string' },
        url: { type: 'string' },
      },
    }));
  } catch (err) {
    throw new UsageError((err as Error).message);
  }

  switch (command as Command) {
    case 'import': {
      const throttle = values['throttle-ms'] === undefined ? 0 : Number(values['throttle-ms']);
      if (!Number.isInteger(throttle) || throttle < 0) {
        throw new UsageError('--throttle-ms must be a non-negative integer');
      }
      return {
        command: 'import',
        manifest: need(values.manifest, '--manifest', 'import'),
        apply: values.apply === true,
        target: parseTarget(values.target),
        confirmRemote: values['confirm-remote'] ?? null,
        allowMassRemoval: values['allow-mass-removal'] === true,
        reportDir: values['report-dir'] ?? DEFAULT_REPORT_DIR,
        throttleMs: throttle,
      };
    }
    case 'load-fixture':
      return { command: 'load-fixture' };
    case 'cut-fixture':
      return {
        command: 'cut-fixture',
        from: need(values.from, '--from', 'cut-fixture'),
        ids: need(values.ids, '--ids', 'cut-fixture'),
      };
    case 'release-check': {
      const list = need(values.checks, '--checks', 'release-check').split(',');
      const checks = list.map((c) => {
        if (!(RELEASE_CHECKS as readonly string[]).includes(c)) {
          throw new UsageError(
            `unknown check "${c}"; expected one of ${RELEASE_CHECKS.join(', ')}`,
          );
        }
        return c as ReleaseCheck;
      });
      return {
        command: 'release-check',
        checks,
        target: parseTarget(values.target),
        confirmRemote: values['confirm-remote'] ?? null,
      };
    }
    case 'download': {
      const dataset = FoodDataset.safeParse(need(values.dataset, '--dataset', 'download'));
      if (!dataset.success) {
        throw new UsageError(`--dataset must be one of ${FoodDataset.options.join(', ')}`);
      }
      return {
        command: 'download',
        dataset: dataset.data,
        out: need(values.out, '--out', 'download'),
        url: values.url ?? null,
      };
    }
  }
}
