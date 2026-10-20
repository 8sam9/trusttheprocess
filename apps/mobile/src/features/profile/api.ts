import { ProfileUpdate, type ProfileRow } from '@ttp/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { gateCache } from '@/lib/gateCache';
import { supabase } from '@/lib/supabase';

/** Query keys include the user id so one account's data can never be served to another. */
export const profileKey = (uid: string | undefined) => ['profile', uid] as const;

export function useProfile() {
  const uid = useAuth().session?.user.id;
  return useQuery({
    queryKey: profileKey(uid),
    enabled: !!uid,
    queryFn: async (): Promise<ProfileRow> => {
      // RLS returns only the caller's row.
      const { data, error } = await supabase.from('profiles').select('*').single();
      if (error) throw error;
      return data as ProfileRow;
    },
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { userId: string; changes: ProfileUpdate }) => {
      const changes = ProfileUpdate.parse(input.changes); // validate before it leaves the device
      const { data, error } = await supabase
        .from('profiles')
        .update(changes)
        .eq('user_id', input.userId)
        .select('*')
        .single();
      if (error) throw error;
      return data as ProfileRow;
    },
    onSuccess: (row, input) => qc.setQueryData(profileKey(input.userId), row),
  });
}

export function useHealthConsent() {
  const qc = useQueryClient();
  const uid = useAuth().session?.user.id;
  return useMutation({
    mutationFn: async (give: boolean) => {
      const { error } = await supabase.rpc(
        give ? 'give_health_data_consent' : 'withdraw_health_data_consent',
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: profileKey(uid) }),
  });
}

export function useDeleteAccount() {
  const qc = useQueryClient();
  const uid = useAuth().session?.user.id;
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
      if (error) throw error;
      await supabase.auth.signOut({ scope: 'local' });
    },
    onSuccess: () => {
      if (uid) gateCache.clear(uid);
      qc.clear();
    },
  });
}
