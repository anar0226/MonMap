import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { jsonResponse } from '../_shared/auth.ts'

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY    = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
      },
    })
  }

  // Authenticate caller and verify admin flag.
  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!jwt) return jsonResponse({ error: 'unauthorized' }, 401)

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userData?.user) return jsonResponse({ error: 'unauthorized' }, 401)

  const isAdmin = userData.user.user_metadata?.is_admin === true
  if (!isAdmin) return jsonResponse({ error: 'forbidden' }, 403)

  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // Parse query params.
  const url    = new URL(req.url)
  const status = url.searchParams.get('status') || 'pending'   // pending|verified|rejected|all
  const page   = Math.max(0, parseInt(url.searchParams.get('page') || '0', 10))
  const limit  = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '25', 10)))

  // verification_documents has no FK to business_owners (only to places),
  // so it cannot be embedded via PostgREST. Fetch the two tables separately.
  let q = service
    .from('business_owners')
    .select(`
      user_id,
      place_id,
      claim_status,
      rejected_reason,
      reviewed_at,
      reviewed_by,
      created_at,
      places ( name, primary_category, formatted_address, short_address )
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(page * limit, page * limit + limit - 1)

  if (status !== 'all') q = q.eq('claim_status', status)

  const { data: rows, error: rowsErr, count } = await q
  if (rowsErr) {
    console.error('admin-list-claims query:', rowsErr)
    return jsonResponse({ error: 'db_error' }, 500)
  }

  // Fetch verification_documents for the returned page keyed by place_id:user_id.
  const docsMap: Record<string, { storage_path: string; doc_type: string }[]> = {}
  const placeIds = [...new Set((rows ?? []).map((r: any) => r.place_id))]
  if (placeIds.length > 0) {
    const { data: docs } = await service
      .from('verification_documents')
      .select('place_id, user_id, storage_path, doc_type')
      .in('place_id', placeIds)
    for (const d of docs ?? []) {
      const key = `${d.place_id}:${d.user_id}`
      if (!docsMap[key]) docsMap[key] = []
      docsMap[key].push({ storage_path: d.storage_path, doc_type: d.doc_type })
    }
  }

  // Fetch auth user emails for the owner IDs.
  const ownerIds = [...new Set((rows ?? []).map((r: any) => r.user_id))]
  const emailMap: Record<string, string> = {}
  const nameMap:  Record<string, string> = {}
  if (ownerIds.length > 0) {
    const { data: users } = await service.auth.admin.listUsers({ perPage: 1000 })
    for (const u of users?.users ?? []) {
      emailMap[u.id] = u.email ?? ''
      nameMap[u.id]  = u.user_metadata?.full_name ?? ''
    }
  }

  const claims = (rows ?? []).map((r: any) => {
    const docs = docsMap[`${r.place_id}:${r.user_id}`] ?? []
    return {
      user_id:         r.user_id,
      place_id:        r.place_id,
      claim_status:    r.claim_status,
      rejected_reason: r.rejected_reason ?? null,
      reviewed_at:     r.reviewed_at ?? null,
      reviewed_by:     r.reviewed_by ?? null,
      submitted_at:    r.created_at,
      doc_count:       docs.length,
      docs,
      place: {
        name:              r.places?.name ?? r.place_id,
        primary_category:  r.places?.primary_category ?? '',
        formatted_address: r.places?.formatted_address ?? r.places?.short_address ?? '',
      },
      owner: {
        email:     emailMap[r.user_id] ?? '',
        full_name: nameMap[r.user_id]  ?? '',
      },
    }
  })

  return jsonResponse({ claims, total: count ?? 0, page, limit })
})
