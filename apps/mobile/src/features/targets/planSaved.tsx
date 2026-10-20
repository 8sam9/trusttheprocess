import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

interface PlanSavedState {
  /** True right after onboarding completes, so Today can say "Plan saved". In memory only: gone on the next open. */
  saved: boolean;
  markSaved: () => void;
}

const PlanSavedContext = createContext<PlanSavedState>({ saved: false, markSaved: () => {} });

export function PlanSavedProvider({ children }: { children: ReactNode }) {
  const [saved, setSaved] = useState(false);
  const value = useMemo(() => ({ saved, markSaved: () => setSaved(true) }), [saved]);
  return <PlanSavedContext.Provider value={value}>{children}</PlanSavedContext.Provider>;
}

export const usePlanSaved = (): PlanSavedState => useContext(PlanSavedContext);
