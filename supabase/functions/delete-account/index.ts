// Permanently deletes the calling user's account and all personal data.
// Triggered by SettingsScreen's "Delete account" action.
//
// The caller's JWT identifies which user to delete. We never accept a userId
// from the request body — that would let any authenticated user nuke any
// other user's account by guessing UUIDs.
//
// Required env (auto-populated by Supabase):
//   SUPABASE_URL
//   SUPABASE_ANON_KEY
//   SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY         = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// CORS headers — the portal is a different origin from the edge function
// host, so the browser will fire an OPTIONS preflight on every invoke().
// Without these, the mobile app keeps working (RN bypasses CORS) but the
// portal's `_sb.functions.invoke('delete-account')` silently fails.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST')    return json({ error: 'Method not allowed' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'Missing Authorization header' }, 401)

  // Resolve caller's user id from their JWT.
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: userErr } = await userClient.auth.getUser()
  if (userErr || !user) return json({ error: 'Unauthorized' }, 401)
  const userId = user.id

  // Service-role client bypasses RLS for the actual deletes.
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // Defence-in-depth: explicitly purge personal data before dropping the auth
  // row. Even if FK cascades change in future migrations, no PII survives
  // this call.
  const tables = ['bookings', 'reviews', 'user_push_tokens']
  for (const table of tables) {
    const { error } = await admin.from(table).delete().eq('user_id', userId)
    if (error) {
      console.error(`delete-account: failed to purge ${table} for ${userId}:`, error)
      return json({ error: `Failed to delete from ${table}` }, 500)
    }
  }

  // Drop the auth.users row. FK cascade clears public.users and any other
  // table that references auth.users (e.g. business_owners).
  const { error: delErr } = await admin.auth.admin.deleteUser(userId)
  if (delErr) {
    console.error(`delete-account: auth deleteUser failed for ${userId}:`, delErr)
    return json({ error: 'Failed to delete auth record' }, 500)
  }

  console.log(`delete-account: deleted user ${userId}`)
  return json({ ok: true })
})
