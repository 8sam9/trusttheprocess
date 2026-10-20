import { createClient } from '@supabase/supabase-js';
import {
  FoodRow,
  FoodRpcErrorCode,
  GetFoodsArgs,
  LookupBarcodeArgs,
  SearchFoodsArgs,
  normaliseGtin,
} from '@ttp/shared';
import { supabase } from './supabase';

/**
 * The only module that reads the food catalogue (spec 002 T8, ADR 0006 point 7, AC 6b).
 * Nothing else in the app may name a food RPC or the `food` schema; an architecture test enforces it.
 *
 * Food data may later live in a second Supabase project. That is a configuration change: set both
 * EXPO_PUBLIC_FOOD_DATA_URL and EXPO_PUBLIC_FOOD_DATA_PUBLISHABLE_KEY. Otherwise the main client is used.
 */

/** Minimal RPC surface used here, so tests can inject a mock. */
export interface FoodRpcClient {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
}

export interface FoodDataEnv {
  url?: string | undefined;
  key?: string | undefined;
}

export type FoodDataErrorCode =
  FoodRpcErrorCode | 'invalid_args' | 'invalid_response' | 'request_failed';

export class FoodDataError extends Error {
  readonly code: FoodDataErrorCode;
  constructor(code: FoodDataErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'FoodDataError';
    this.code = code;
  }
}

/**
 * Binding rule (spec 002 T8, AC 44): no OFF-derived food is shown to users until the attribution page (011)
 * ships. 011 flips this constant. Both the RPC flag and a client-side filter use it.
 */
export const includeOff = false;

/** True when both optional food-data variables are set (trimmed, non-empty). */
export function hasSeparateFoodProject(env: FoodDataEnv): boolean {
  return Boolean(env.url?.trim() && env.key?.trim());
}

/**
 * Picks the client: a dedicated food-data project when both variables are set, otherwise `fallback`
 * (the main Supabase client). `create` is injectable for tests.
 */
export function resolveFoodClient(
  env: FoodDataEnv,
  fallback: FoodRpcClient,
  create: (url: string, key: string) => FoodRpcClient = (url, key) =>
    // Anonymous access only: the second project cannot verify the main project's user JWTs (ADR 0006).
    createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    }) as unknown as FoodRpcClient,
): FoodRpcClient {
  if (!hasSeparateFoodProject(env)) return fallback;
  return create((env.url ?? '').trim(), (env.key ?? '').trim());
}

let cached: FoodRpcClient | undefined;

function getClient(): FoodRpcClient {
  if (!cached) {
    // Static property access so Expo inlines the EXPO_PUBLIC_* values.
    cached = resolveFoodClient(
      {
        url: process.env.EXPO_PUBLIC_FOOD_DATA_URL,
        key: process.env.EXPO_PUBLIC_FOOD_DATA_PUBLISHABLE_KEY,
      },
      supabase as unknown as FoodRpcClient,
    );
  }
  return cached;
}

/** Test hook: forget the cached client (or install one). */
export function __setFoodClientForTests(client: FoodRpcClient | undefined): void {
  cached = client;
}

function parseArgs<T>(
  schema: { safeParse(v: unknown): { success: true; data: T } | { success: false; error: Error } },
  value: unknown,
): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new FoodDataError('invalid_args', 'Invalid food data arguments.', {
      cause: result.error,
    });
  }
  return result.data;
}

async function callRpc(fn: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await getClient().rpc(fn, args);
  if (error) {
    const known = FoodRpcErrorCode.options.find((code) => error.message.includes(code));
    throw new FoodDataError(known ?? 'request_failed', known ?? 'Food data request failed.', {
      cause: error,
    });
  }
  return data;
}

function parseRows(data: unknown): FoodRow[] {
  const result = FoodRow.array().safeParse(data ?? []);
  if (!result.success) {
    throw new FoodDataError('invalid_response', 'Unexpected food data response.', {
      cause: result.error,
    });
  }
  return includeOff ? result.data : result.data.filter((row) => row.source !== 'off');
}

/** Rows by id, hidden ones included (a favourite or diary link keeps working). Empty input makes no call. */
export async function getFoods(ids: readonly string[]): Promise<FoodRow[]> {
  if (ids.length === 0) return [];
  const args = parseArgs(GetFoodsArgs, { p_ids: [...ids], p_include_off: includeOff });
  return parseRows(await callRpc('get_foods', args));
}

/**
 * Visible canonical food for a scanned or typed barcode, in any of its UPC-A / EAN-13 / GTIN-14 forms.
 * Invalid or restricted (in-store) codes resolve to null without a network call.
 */
export async function lookupBarcode(raw: string): Promise<FoodRow | null> {
  const gtin = normaliseGtin(raw);
  if (!gtin.ok || gtin.restricted) return null;
  const args = parseArgs(LookupBarcodeArgs, {
    p_gtin14: gtin.gtin14,
    p_include_off: includeOff,
  });
  const rows = parseRows(await callRpc('lookup_barcode', args));
  return rows[0] ?? null;
}

/** Functional baseline search (003 owns ranking). Returns visible canonical foods. */
export async function searchFoods(query: string, limit?: number): Promise<FoodRow[]> {
  const args = parseArgs(SearchFoodsArgs, {
    p_query: query,
    ...(limit === undefined ? {} : { p_limit: limit }),
    p_include_off: includeOff,
  });
  return parseRows(await callRpc('search_foods', args));
}
