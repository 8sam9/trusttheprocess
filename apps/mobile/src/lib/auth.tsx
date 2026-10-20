import { useQueryClient } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { gateCache } from './gateCache';
import { supabase } from './supabase';

interface AuthState {
  session: Session | null;
  /** True until the stored session has been read on startup. */
  loading: boolean;
}

const AuthContext = createContext<AuthState>({ session: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, loading: true });
  const queryClient = useQueryClient();
  // The id of the last signed-in user, so the cache of that user can be cleared when the session ends.
  const lastUid = useRef<string | null>(null);

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => {
        lastUid.current = data.session?.user.id ?? null;
        setState({ session: data.session, loading: false });
      })
      .catch(() => setState({ session: null, loading: false }));
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        // Nothing of the previous account may survive on this device: server state and the offline gate cache.
        if (lastUid.current) gateCache.clear(lastUid.current);
        queryClient.clear();
        lastUid.current = null;
      } else if (session) {
        lastUid.current = session.user.id;
      }
      setState({ session, loading: false });
    });
    return () => data.subscription.unsubscribe();
  }, [queryClient]);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export const useAuth = (): AuthState => useContext(AuthContext);
