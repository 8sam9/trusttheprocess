import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { z } from 'zod';
import { BudgetConfig, MarketsConfig, RulesConfig, type ImporterConfig } from './schemas/config.js';

export const DEFAULT_CONFIG_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'config',
);

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

function loadJson<T>(file: string, schema: z.ZodType<T>): T {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    throw new ConfigError(`cannot read config ${file}: ${(err as Error).message}`);
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    throw new ConfigError(`invalid config ${file}: ${issues}`);
  }
  return parsed.data;
}

/** Loads and validates config/{markets,rules,budget}.json (fails loudly, never falls back to defaults). */
export function loadConfig(dir: string = DEFAULT_CONFIG_DIR): ImporterConfig {
  return {
    markets: loadJson(path.join(dir, 'markets.json'), MarketsConfig),
    rules: loadJson(path.join(dir, 'rules.json'), RulesConfig),
    budget: loadJson(path.join(dir, 'budget.json'), BudgetConfig),
  };
}
