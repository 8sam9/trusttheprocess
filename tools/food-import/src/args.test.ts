import { describe, expect, it } from 'vitest';
import { DEFAULT_REPORT_DIR, UsageError, parseCli } from './args.js';

describe('CLI parsing', () => {
  it('import is a dry run by default and targets local', () => {
    expect(parseCli(['import', '--manifest', 'm.json'])).toEqual({
      command: 'import',
      manifest: 'm.json',
      apply: false,
      target: 'local',
      confirmRemote: null,
      allowMassRemoval: false,
      reportDir: DEFAULT_REPORT_DIR,
      throttleMs: 0,
    });
  });

  it('parses every import flag', () => {
    const c = parseCli([
      'import',
      '--manifest',
      'm.json',
      '--apply',
      '--target',
      'remote',
      '--confirm-remote',
      'ref',
      '--allow-mass-removal',
      '--report-dir',
      'out',
      '--throttle-ms',
      '250',
    ]);
    expect(c).toMatchObject({
      apply: true,
      target: 'remote',
      confirmRemote: 'ref',
      allowMassRemoval: true,
      reportDir: 'out',
      throttleMs: 250,
    });
  });

  it('rejects missing, unknown and malformed arguments with a usage error', () => {
    expect(() => parseCli(['import'])).toThrow(/--manifest is required/);
    expect(() => parseCli(['import', '--manifest', 'm', '--target', 'prod'])).toThrow(UsageError);
    expect(() => parseCli(['import', '--manifest', 'm', '--throttle-ms', '-1'])).toThrow(
      UsageError,
    );
    expect(() => parseCli(['import', '--manifest', 'm', '--bogus'])).toThrow(UsageError);
    expect(() => parseCli(['nope'])).toThrow(/unknown command/);
    expect(() => parseCli(['import', 'stray', '--manifest', 'm'])).toThrow(UsageError);
  });

  it('parses release-check, download and cut-fixture', () => {
    expect(parseCli(['release-check', '--checks', 'golden,size'])).toMatchObject({
      command: 'release-check',
      checks: ['golden', 'size'],
      target: 'local',
    });
    expect(() => parseCli(['release-check', '--checks', 'nope'])).toThrow(/unknown check/);
    expect(parseCli(['download', '--dataset', 'off', '--out', 'd'])).toMatchObject({
      command: 'download',
      dataset: 'off',
      url: null,
    });
    expect(() => parseCli(['download', '--dataset', 'bogus', '--out', 'd'])).toThrow(UsageError);
    expect(parseCli(['cut-fixture', '--from', 'a', '--ids', 'b'])).toMatchObject({
      command: 'cut-fixture',
    });
    expect(parseCli(['load-fixture'])).toEqual({ command: 'load-fixture' });
    expect(parseCli([])).toEqual({ command: 'help' });
  });
});
