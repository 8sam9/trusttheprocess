import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const TOOL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const FIXTURE_DIR = path.join(TOOL_DIR, 'fixtures');
export const FIXTURE_MANIFEST_V1 = path.join(FIXTURE_DIR, 'manifest.v1.json');
export const FIXTURE_MANIFEST_V2 = path.join(FIXTURE_DIR, 'manifest.v2.json');
export const GOLDEN_LIST_FILE = path.join(FIXTURE_DIR, 'golden-list.json');
export const FIXTURE_IDS_FILE = path.join(FIXTURE_DIR, 'fixture-ids.json');
export const DEFAULT_DOWNLOAD_DIR = path.join(TOOL_DIR, '.work', 'downloads');
/** The fixtures directory must stay at or below this size (AC 46). */
export const FIXTURE_MAX_BYTES = 5 * 1024 * 1024;
