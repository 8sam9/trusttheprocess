import { z } from 'zod';
import { FoodDataset } from '@ttp/shared';

/** Input declaration for one run (spec T5.3). */
export const ManifestInput = z.strictObject({
  dataset: FoodDataset,
  path: z.string().min(1),
  releaseLabel: z.string().min(1).max(64),
  /** Only meaningful in a full run: absence from this file may hide stored foods (AC 33, 35). */
  snapshot: z.boolean(),
});
export type ManifestInput = z.infer<typeof ManifestInput>;

export const Manifest = z
  .strictObject({
    mode: z.enum(['full', 'partial']),
    inputs: z.array(ManifestInput).min(1),
    /** Provenance and licence of the files (AC 46); free-form, never read by the engine. */
    meta: z.record(z.string(), z.string()).optional(),
  })
  .superRefine((m, ctx) => {
    if (m.mode === 'partial') {
      m.inputs.forEach((input, i) => {
        if (input.snapshot) {
          ctx.addIssue({
            code: 'custom',
            path: ['inputs', i, 'snapshot'],
            message: 'snapshot: true is only allowed in a full run (AC 35)',
          });
        }
      });
    }
    const seen = new Set<string>();
    m.inputs.forEach((input, i) => {
      if (seen.has(input.dataset)) {
        ctx.addIssue({
          code: 'custom',
          path: ['inputs', i, 'dataset'],
          message: `dataset ${input.dataset} is listed twice`,
        });
      }
      seen.add(input.dataset);
    });
  });
export type Manifest = z.infer<typeof Manifest>;
