import { v5 as uuidv5 } from 'uuid';
import type { FoodDataset } from '@ttp/shared';

/**
 * Namespace for deterministic food ids (ADR 0006): id = uuidv5(FOOD_ID_NAMESPACE, dataset + ':' + source_ref).
 * NEVER change this value after the first import: every stored id, favourite and diary link derives from it.
 */
export const FOOD_ID_NAMESPACE = '5190ec4a-8af7-4c32-b405-b60f5ee99317';

export function foodId(dataset: FoodDataset, sourceRef: string): string {
  return uuidv5(`${dataset}:${sourceRef}`, FOOD_ID_NAMESPACE);
}
