/**
 * Version two of the Foundation fixture (AC 30 to 36): one changed value, one removed row, one row that now fails
 * a reject rule. Applied to the permanent synthetic rule rows only, so it works unchanged on top of real records.
 */
type Rec = Record<string, unknown>;

function setAmount(rec: Rec, nutrientId: number, amount: number): void {
  const list = rec['foodNutrients'] as { nutrient: { id: number }; amount?: number }[];
  const hit = list.find((e) => e.nutrient.id === nutrientId);
  if (!hit) throw new Error(`rule row ${String(rec['ndbNumber'])} has no nutrient ${nutrientId}`);
  hit.amount = amount;
}

export function deriveFoundationV2(v1: Rec[]): Rec[] {
  return v1
    .filter((rec) => rec['ndbNumber'] !== 'synthetic-remove-me')
    .map((rec) => {
      const copy = structuredClone(rec);
      if (copy['ndbNumber'] === 'synthetic-update-me') setAmount(copy, 1008, 90);
      if (copy['ndbNumber'] === 'synthetic-break-me') setAmount(copy, 1003, 150);
      return copy;
    });
}
