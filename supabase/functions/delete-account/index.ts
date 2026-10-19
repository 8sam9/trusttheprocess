// Deletes the calling user's account and all their data.
// Profile and (future) diary rows are removed by `on delete cascade` from auth.users.
// Required by Apple App Store guideline 5.1.1(v), Google Play policy and GDPR art. 17.
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing env var ${name}`);
  return value;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return json(401, { error: 'unauthorized' });

  try {
    const url = env('SUPABASE_URL');
    // Identify the caller from their own JWT. Never trust a user id from the request body.
    const userClient = createClient(url, env('SUPABASE_ANON_KEY'), {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data, error } = await userClient.auth.getUser();
    if (error || !data.user) return json(401, { error: 'unauthorized' });

    const admin = createClient(url, env('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false },
    });
    // TODO(M1+): delete Storage objects (meal photos) and cancel RevenueCat subscriber before this.
    const { error: deleteError } = await admin.auth.admin.deleteUser(data.user.id);
    if (deleteError) {
      console.error('delete-account failed', { code: deleteError.code }); // no PII in logs
      return json(500, { error: 'delete_failed' });
    }
    return json(200, { deleted: true });
  } catch (e) {
    console.error('delete-account error', e instanceof Error ? e.message : 'unknown');
    return json(500, { error: 'internal_error' });
  }
});
