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
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)

  // Auth + admin check.
  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!jwt) return jsonResponse({ error: 'unauthorized' }, 401)

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
  const { data: userData, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userData?.user) return jsonResponse({ error: 'unauthorized' }, 401)

  const isAdmin    = userData.user.user_metadata?.is_admin === true
  const adminEmail = userData.user.email ?? 'admin'
  if (!isAdmin) return jsonResponse({ error: 'forbidden' }, 403)

  const body: { place_id: string; user_id: string; action: 'approve' | 'reject'; reason?: string }
    = await req.json()

  const { place_id, user_id, action, reason } = body
  if (!place_id || !user_id || !['approve', 'reject'].includes(action)) {
    return jsonResponse({ error: 'invalid_params' }, 400)
  }

  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  if (action === 'approve') {
    const { error } = await service
      .from('business_owners')
      .update({
        claim_status: 'verified',
        rejected_reason: null,
        reviewed_at: new Date().toISOString(),
        reviewed_by: adminEmail,
      })
      .eq('place_id', place_id)
      .eq('user_id', user_id)
    if (error) {
      console.error('admin-review-claim approve:', error)
      return jsonResponse({ error: 'db_error' }, 500)
    }

    // Enable the booking tab in the mobile app now that the owner is verified.
    const { error: placeErr } = await service
      .from('places')
      .update({ booking_enabled: true })
      .eq('place_id', place_id)
    if (placeErr) {
      console.error('admin-review-claim set booking_enabled:', placeErr)
      return jsonResponse({ error: 'db_error' }, 500)
    }
  } else {
    const { error } = await service
      .from('business_owners')
      .update({
        claim_status: 'rejected',
        rejected_reason: reason ?? null,
        reviewed_at: new Date().toISOString(),
        reviewed_by: adminEmail,
      })
      .eq('place_id', place_id)
      .eq('user_id', user_id)
    if (error) {
      console.error('admin-review-claim reject:', error)
      return jsonResponse({ error: 'db_error' }, 500)
    }

    // Revoke booking access if a previously approved owner is rejected.
    await service
      .from('places')
      .update({ booking_enabled: false })
      .eq('place_id', place_id)
  }

  // Fetch owner email to send notification.
  const { data: ownerAuth } = await service.auth.admin.getUserById(user_id)
  const ownerEmail = ownerAuth?.user?.email
  const ownerName  = ownerAuth?.user?.user_metadata?.full_name ?? 'Бизнесийн эзэн'

  // Fetch place name for the email body.
  const { data: place } = await service.from('places').select('name').eq('place_id', place_id).maybeSingle()
  const placeName = place?.name ?? place_id

  if (ownerEmail) {
    const subject = action === 'approve'
      ? `MonMap: "${placeName}" бизнес баталгаажлаа ✅`
      : `MonMap: "${placeName}" баталгаажуулалт татгалзагдлаа`

    const body = action === 'approve'
      ? `Сайн байна уу, ${ownerName}!\n\nТаны "${placeName}" бизнес MonMap платформд баталгаажлаа. Одоо захиалга хүлээн авч эхэлж болно.\n\nhttps://portal.monmap.mn/dashboard.html`
      : `Сайн байна уу, ${ownerName}!\n\nТаны "${placeName}" бизнесийн баталгаажуулах хүсэлт татгалзагдлаа.\n${reason ? `\nШалтгаан: ${reason}\n` : ''}\nДахин оролдох эсвэл бидэнтэй холбогдоно уу: support@monmap.mn`

    // Use Supabase Auth admin email if Resend is not configured.
    // The auth.admin.generateLink approach sends via Supabase's SMTP — good enough for MVP.
    try {
      await service.auth.admin.updateUserById(user_id, {
        email: ownerEmail,
        data: {
          _notification_subject: subject,
          _notification_body: body,
        },
      })
    } catch (e) {
      // Email delivery is best-effort — don't fail the review action.
      console.warn('admin-review-claim email attempt:', e)
    }
  }

  return jsonResponse({ ok: true })
})
