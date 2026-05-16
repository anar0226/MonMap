// MonMap Portal — Web Push client
// Registers the service worker, subscribes to push, saves the subscription to
// Supabase, and renders the enable-notifications banner.
//
// Depends on: _sb (window global from supabase-client.js), showToast (utils.js)
// Called from each portal page's init() after auth is confirmed:
//   initPush(userId, placeId)

// The VAPID public key generated for this project.
// If you regenerate keys (supabase secrets set VAPID_PUBLIC_KEY=...) you MUST
// update this value too — mismatched keys will cause subscribe() to fail.
const VAPID_PUBLIC_KEY = 'BL0zkvUKTzBJxDnKMPATDX8mhSColVXT0fUq4L6MkU-YEsr0-vN5X2Xmas6E5KksBIrY3Xpj_quiJgQ-5AxFvDE'

// Web Push requires the application server key as a Uint8Array.
function _vapidKey() {
  const base64 = VAPID_PUBLIC_KEY.replace(/-/g, '+').replace(/_/g, '/')
  const padded  = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const raw     = atob(padded)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

// ── Supabase persistence ──────────────────────────────────────────────────────

async function _saveSub(userId, placeId, sub) {
  const json = sub.toJSON()
  const { error } = await _sb
    .from('portal_push_subscriptions')
    .upsert(
      {
        user_id:    userId,
        place_id:   placeId,
        endpoint:   json.endpoint,
        p256dh:     json.keys.p256dh,
        auth_key:   json.keys.auth,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' },
    )
  if (error) throw error
}

async function _deleteSub(endpoint) {
  await _sb.from('portal_push_subscriptions').delete().eq('endpoint', endpoint)
}

// ── Core subscribe / unsubscribe ──────────────────────────────────────────────

async function subscribePush(userId, placeId) {
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly:      true,
    applicationServerKey: _vapidKey(),
  })
  await _saveSub(userId, placeId, sub)
  return sub
}

// ── Banner UI helpers ─────────────────────────────────────────────────────────

function _showBanner(userId, placeId) {
  // Don't show if user already dismissed it this session.
  if (localStorage.getItem('mm_push_dismissed')) return
  const banner = document.getElementById('pushBanner')
  if (!banner) return
  banner.style.display = 'flex'

  document.getElementById('pushEnableBtn')?.addEventListener('click', async () => {
    try {
      const permission = await Notification.requestPermission()
      if (permission === 'granted') {
        await subscribePush(userId, placeId)
        _hideBanner()
        showToast('success', 'Мэдэгдэл идэвхжлээ', 'Шинэ захиалга ирэхэд та мэдэгдэл авна.')
      } else {
        _hideBanner()
        showToast('info', 'Мэдэгдэл идэвхжүүлэгдсэнгүй', 'Хэрэгтэй үед тохиргооноос идэвхжүүлнэ үү.')
      }
    } catch (e) {
      console.error('push subscribe failed:', e)
      showToast('error', 'Алдаа', 'Мэдэгдэл идэвхжүүлэхэд алдаа гарлаа.')
    }
  })

  document.getElementById('pushBannerClose')?.addEventListener('click', () => {
    _hideBanner()
    localStorage.setItem('mm_push_dismissed', '1')
  })
}

function _hideBanner() {
  const banner = document.getElementById('pushBanner')
  if (banner) banner.style.display = 'none'
}

// ── Main entry point ──────────────────────────────────────────────────────────

async function initPush(userId, placeId) {
  // Feature-detect — older browsers or insecure contexts can't use push.
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return

  // Register (or get the already-registered) service worker.
  let reg
  try {
    reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
    await navigator.serviceWorker.ready
  } catch (e) {
    console.warn('SW registration failed:', e)
    return
  }

  // If there's already a live subscription, silently re-save it (handles the
  // case where the owner cleared localStorage but kept the browser subscription).
  const existing = await reg.pushManager.getSubscription()
  if (existing) {
    try { await _saveSub(userId, placeId, existing) } catch { /* best-effort */ }
    _hideBanner()
    return
  }

  // No subscription yet.
  if (Notification.permission === 'granted') {
    // Permission already granted (e.g. after a page reload) — subscribe silently.
    try {
      await subscribePush(userId, placeId)
    } catch { /* best-effort */ }
  } else if (Notification.permission === 'default') {
    // Haven't asked yet — show the banner.
    _showBanner(userId, placeId)
  }
  // If 'denied', stay silent — badgering the user makes things worse.
}

// ── Service worker message listener ──────────────────────────────────────────
// The SW posts messages back to the page for two events:
//   OPEN_BOOKING          — notification was tapped while this tab was open
//   PUSH_SUBSCRIPTION_CHANGED — browser rotated the push endpoint

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', async (event) => {
    const { type, bookingId, subscription } = event.data ?? {}

    if (type === 'OPEN_BOOKING' && bookingId) {
      // Delegate to the page's openDetail() if it exists (bookings.html).
      if (typeof openDetail === 'function') openDetail(bookingId)
    }

    if (type === 'PUSH_SUBSCRIPTION_CHANGED' && subscription) {
      // Re-save the rotated subscription.  We don't have userId/placeId here
      // so read them from the cached biz object that utils.js stores.
      try {
        const biz  = JSON.parse(localStorage.getItem('mm_biz') || 'null')
        const { data: { session } } = await _sb.auth.getSession()
        if (session && biz?.id) {
          await _sb.from('portal_push_subscriptions').upsert(
            {
              user_id:    session.user.id,
              place_id:   biz.id,
              endpoint:   subscription.endpoint,
              p256dh:     subscription.keys.p256dh,
              auth_key:   subscription.keys.auth,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'endpoint' },
          )
        }
      } catch (e) { console.warn('subscription rotation save failed:', e) }
    }
  })
}
