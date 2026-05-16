// Shared JWT validation for nav-trip + eta-share edge functions.
// Returns the authenticated user's id or null.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export async function authUserId(
  req: Request,
  supabaseUrl: string,
  supabaseAnonKey: string,
): Promise<string | null> {
  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!jwt) return null
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
  const { data, error } = await userClient.auth.getUser()
  if (error || !data?.user) return null
  return data.user.id
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
