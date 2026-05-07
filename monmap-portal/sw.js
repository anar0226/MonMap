// MonMap Portal — Service Worker
// Handles incoming Web Push events and notification click routing.
// Scope: / (portal root), registered by js/push.js

const CACHE_VERSION = 'monmap-portal-v1'

// ── Push event ────────────────────────────────────────────────────────────────
// The push payload is JSON: { title, body, bookingId, url }
self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { /* malformed payload */ }

  const title     = data.title    ?? '🔔 Шинэ захиалгын хүсэлт'
  const body      = data.body     ?? ''
  const bookingId = data.bookingId ?? null
  const url       = data.url      ?? (self.location.origin + '/bookings.html')

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon:  '/assets/icon-192.png',   // add a 192×192 MonMap icon here
      badge: '/assets/badge-96.png',   // monochrome 96×96 badge for Android status bar
      data:  { bookingId, url },
      // Keep the notification on screen until the owner explicitly acts on it.
      requireInteraction: true,
      // Tag deduplicates: a second push for the same booking replaces the first banner.
      tag:      bookingId ? `booking-${bookingId}` : 'monmap-booking',
      renotify: !!bookingId,
      actions: [
        { action: 'open',    title: '📋 Захиалга харах' },
        { action: 'dismiss', title: 'Хаах' },
      ],
    }),
  )
})

// ── Notification click ────────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  const { bookingId, url } = event.notification.data ?? {}
  event.notification.close()

  if (event.action === 'dismiss') return

  // Try to focus an existing portal tab; open a new one if none found.
  const target = url ?? (self.location.origin + '/bookings.html')

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((list) => {
        // Prefer a tab already showing the portal.
        for (const client of list) {
          if (new URL(client.url).origin === self.location.origin) {
            // Tell the page to open the detail modal for this booking.
            if (bookingId) client.postMessage({ type: 'OPEN_BOOKING', bookingId })
            return client.focus()
          }
        }
        // No portal tab open — open one pointing at the right booking.
        return clients.openWindow(target)
      }),
  )
})

// ── Push subscription change ──────────────────────────────────────────────────
// Browser rotates the subscription endpoint automatically; we must re-save it.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.registration.pushManager
      .subscribe({ userVisibleOnly: true, applicationServerKey: event.oldSubscription?.options?.applicationServerKey })
      .then((sub) => {
        // Post the new subscription back to any open portal tab so it can
        // upsert to Supabase.  The page handles this via the message listener in push.js.
        return clients
          .matchAll({ type: 'window', includeUncontrolled: true })
          .then((list) => {
            const payload = { type: 'PUSH_SUBSCRIPTION_CHANGED', subscription: sub.toJSON() }
            list.forEach((c) => c.postMessage(payload))
          })
      })
      .catch((e) => console.error('pushsubscriptionchange resubscribe failed:', e)),
  )
})
