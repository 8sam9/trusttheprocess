export type ImportErrorCode =
  | 'bad_input' // preflight (AC 5, 38): nothing was written
  | 'lock' // another import holds the advisory lock
  | 'database'; // cannot reach or use the database

/** A refusal with an actionable message (spec section 7: say which file, which rule, which count). */
export class ImportError extends Error {
  constructor(
    readonly code: ImportErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ImportError';
  }
}

/** Thrown by the fault hook (AC 37) to simulate a killed process: the run row is deliberately left `running`. */
export class FaultInjectedError extends Error {
  constructor(readonly afterBatches: number) {
    super(`fault injected after ${afterBatches} write batch(es) (FOOD_IMPORT_FAULT_AFTER_BATCHES)`);
    this.name = 'FaultInjectedError';
  }
}
