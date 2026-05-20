// MonMap Portal — Shared Utilities
// Real DB schema: public.places + public.bookings + public.business_owners

// HTML-escape any string (user-supplied or DB-stored) before interpolating into innerHTML.
// Guest-supplied fields (guest_name, guest_phone) reach the portal via the mobile booking flow,
// so they must be treated as untrusted at the render layer.
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

// HTML-escape a JSON blob for safe embedding inside a double-quoted HTML attribute (e.g. inline onclick).
function escapeAttrJson(o) {
  return JSON.stringify(o)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ── hCaptcha helpers ──
// The site key lives on window._HCAPTCHA_SITE_KEY (set in supabase-client.js).
// While that's empty, every helper here is a no-op so the portal works without
// CAPTCHA configured. Once Supabase auth has hCaptcha enabled, set the key and
// the login/register forms will require a solved widget before submit.
const _HCAPTCHA_API_URL = 'https://js.hcaptcha.com/1/api.js?render=explicit';
let _hcaptchaScriptPromise = null;
const _hcaptchaWidgetIds = new WeakMap();

function _loadHCaptchaScript() {
  if (_hcaptchaScriptPromise) return _hcaptchaScriptPromise;
  _hcaptchaScriptPromise = new Promise((resolve, reject) => {
    if (window.hcaptcha) return resolve();
    const s = document.createElement('script');
    s.src = _HCAPTCHA_API_URL;
    s.async = true; s.defer = true;
    s.onload = () => {
      const tick = () => window.hcaptcha ? resolve() : setTimeout(tick, 50);
      tick();
    };
    s.onerror = () => reject(new Error('hCaptcha failed to load'));
    document.head.appendChild(s);
  });
  return _hcaptchaScriptPromise;
}

// Mount the hCaptcha widget into `containerEl`. Returns true if mounted, false
// if no site key is configured (CAPTCHA disabled).
async function mountCaptcha(containerEl) {
  if (!window._HCAPTCHA_SITE_KEY || !containerEl) return false;
  await _loadHCaptchaScript();
  if (_hcaptchaWidgetIds.has(containerEl)) return true;
  const widgetId = window.hcaptcha.render(containerEl, {
    sitekey: window._HCAPTCHA_SITE_KEY,
    size:    'normal',
  });
  _hcaptchaWidgetIds.set(containerEl, widgetId);
  return true;
}

// Returns the solved hCaptcha token from the widget rendered in `containerEl`,
// or '' when CAPTCHA is disabled / unsolved.
function getCaptchaToken(containerEl) {
  if (!window._HCAPTCHA_SITE_KEY || !containerEl || !window.hcaptcha) return '';
  const widgetId = _hcaptchaWidgetIds.get(containerEl);
  if (widgetId === undefined) return '';
  return window.hcaptcha.getResponse(widgetId) || '';
}

function resetCaptcha(containerEl) {
  if (!window._HCAPTCHA_SITE_KEY || !containerEl || !window.hcaptcha) return;
  const widgetId = _hcaptchaWidgetIds.get(containerEl);
  if (widgetId !== undefined) window.hcaptcha.reset(widgetId);
}

// ── Toast notifications ──
function showToast(type, title, msg) {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    container.id = 'toastContainer';
    document.body.appendChild(container);
  }
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || 'ℹ️'}</span>
    <div class="toast-body">
      <div class="toast-title">${escapeHtml(title)}</div>
      ${msg ? `<div class="toast-msg">${escapeHtml(msg)}</div>` : ''}
    </div>
    <button onclick="this.closest('.toast').remove()" style="background:none;border:none;color:var(--gray-400);cursor:pointer;font-size:1rem;padding:0;margin-left:8px;flex-shrink:0;">✕</button>
  `;
  container.appendChild(toast);
  requestAnimationFrame(() => { requestAnimationFrame(() => { toast.classList.add('show'); }); });
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, 4000);
}

// ── Idle timeout ──
// 30 minutes of no portal activity → force re-authentication. Implemented
// client-side only — the Supabase token is still valid until its own expiry,
// but the portal refuses to use it until the owner signs in again. Defense
// in depth, not a substitute for short-lived tokens.
const _IDLE_LIMIT_MS = 30 * 60 * 1000;
function _markActive() {
  try { localStorage.setItem('mm_last_active', String(Date.now())); } catch (_) {}
}
function _isIdle() {
  const t = parseInt(localStorage.getItem('mm_last_active') || '0', 10);
  return t > 0 && (Date.now() - t) > _IDLE_LIMIT_MS;
}
// Refresh the activity timestamp on any user input. Throttled so we don't
// thrash localStorage on every mousemove/keystroke.
let _idleThrottle = 0;
['click','keydown','scroll','mousemove','touchstart'].forEach(evt => {
  window.addEventListener(evt, () => {
    const now = Date.now();
    if (now - _idleThrottle > 5000) { _idleThrottle = now; _markActive(); }
  }, { passive: true });
});

// ── Auth guard (async) ──
// Returns { session, user, biz } where biz = { id, name, type, verified, claim_status }.
// `verified` is derived from the DB-side claim_status ('verified' | 'pending' | 'rejected'),
// NOT a client claim — the DB trigger in 20260510000001 sets the correct value at insert
// time, and the bookings/places owner-update RLS only allows mutation when verified.
async function requireAuth() {
  const { data: { session } } = await _sb.auth.getSession();
  if (!session) { window.location.href = 'login.html'; return null; }
  if (_isIdle()) {
    await _sb.auth.signOut();
    localStorage.removeItem('mm_biz');
    localStorage.removeItem('mm_last_active');
    window.location.href = 'login.html?reason=idle';
    return null;
  }
  _markActive();

  let biz = JSON.parse(localStorage.getItem('mm_biz') || 'null');
  if (!biz || biz.claim_status === undefined) {
    const { data } = await _sb
      .from('business_owners')
      .select('place_id, claim_status, rejected_reason, places(name, primary_category)')
      .eq('user_id', session.user.id)
      .maybeSingle();
    if (data) {
      biz = {
        id:              data.place_id,
        name:            (data.places && data.places.name) || data.place_id,
        type:            (data.places && data.places.primary_category) || 'Бизнес',
        claim_status:    data.claim_status,
        verified:        data.claim_status === 'verified',
        rejected_reason: data.rejected_reason || null,
      };
      localStorage.setItem('mm_biz', JSON.stringify(biz));
    }
  }

  return { session, user: session.user, biz: biz || null };
}

// ── Places search (for registration) ──
// Clean PostgREST filter metacharacters so user input stays inside one
// ilike pattern and cannot turn into wildcard-everything / extra OR clauses.
function _cleanPlaceSearchTerm(s) {
  return String(s || '')
    .replace(/[,()*%_\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function _withTimeout(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { controller, done: () => clearTimeout(timer) };
}

async function _searchPlacesRest(cleaned) {
  const supabaseUrl = window._SUPABASE_URL;
  const supabaseKey = window._SUPABASE_KEY;
  if (!supabaseUrl || !supabaseKey || !window.fetch || !window.AbortController) return null;

  // Use the search_unclaimed_places RPC so RLS on business_owners is bypassed
  // correctly (the anon key can't see foreign rows via plain table queries).
  const timeout = _withTimeout(8000);
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/search_unclaimed_places`, {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ query: cleaned }),
      signal: timeout.controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`places search failed (${res.status}): ${text || res.statusText}`);
    }
    return await res.json();
  } finally {
    timeout.done();
  }
}
// Search places by name OR address fragment. The claim flow on register.html
// is the main caller — we used to only match `name`, which silently returned
// empty whenever the owner typed an address fragment or a partial Cyrillic
// stem that didn't sit at a word boundary in the name column. Adding the
// address column (and surfacing errors instead of swallowing them as `[]`)
// makes the dropdown actually populate for the common search shapes.
//
// PostgREST `or` filter separates clauses with `,`. The user-supplied portion
// of each `ilike.<pattern>` value can't contain raw commas or parentheses, so
// we strip those and other filter metacharacters before splicing it in.
async function searchPlaces(query) {
  const cleaned = _cleanPlaceSearchTerm(query);
  if (!cleaned) return [];

  try {
    const data = await _searchPlacesRest(cleaned);
    if (Array.isArray(data)) return data;
  } catch (error) {
    console.error('searchPlaces REST failed:', error);
  }

  const timeout = _withTimeout(8000);
  try {
    const { data, error } = await _sb
      .rpc('search_unclaimed_places', { query: cleaned })
      .abortSignal(timeout.controller.signal);
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('searchPlaces failed:', error);
    return [];
  } finally {
    timeout.done();
  }
}

// ── Booking helpers ──
// Reads the first-class service / duration_minutes / note columns added in
// migration 20260513000001. Older rows that pre-date that migration return
// null for those columns and fall back to sane defaults.
function _mapBooking(b) {
  const s = (b.status || 'pending');
  const statusNorm = s === 'cancelled' ? 'canceled' : s;
  const partySize = Math.max(1, parseInt(b.party_size, 10) || 1);
  return {
    // Normalize to string so onclick-embedded IDs (always strings) match with ===
    id:            String(b.id),
    client:        b.guest_name   || 'Харилцагч',
    phone:         b.guest_phone  || '',
    partySize,
    partyText:     `${partySize} хүн`,
    date:          b.booked_date,
    time:          b.time_slot,
    status:        statusNorm,
    service:       b.service      || '',
    duration:      Math.max(1, parseInt(b.duration_minutes, 10) || 60),
    note:          b.note         || '',
    depositAmount: b.deposit_amount ?? null,
    paymentId:     b.payment_id   ?? null,
  };
}

// Supabase config.toml caps PostgREST at max_rows=1000. The previous
// unbounded query ordered by booked_date ASC, so once a place crossed ~1000
// lifetime bookings it returned the 1000 *oldest* rows — recent bookings
// silently disappeared from the dashboard. Every caller now goes through a
// purpose-bounded helper that loads only the rows it actually renders.
//
// Common shape: always include any pending bookings (so the "хүлээгдэж буй"
// counter stays accurate even when the row's date falls outside the window)
// plus the date-bounded slice the caller needs.
async function _fetchBookingsBounded({ placeId, sinceDate, untilDate, limit = 1000 }) {
  let q = _sb.from('bookings').select('*').eq('place_id', placeId);
  if (sinceDate) q = q.gte('booked_date', sinceDate);
  if (untilDate) q = q.lte('booked_date', untilDate);
  q = q.order('booked_date', { ascending: true })
       .order('time_slot',   { ascending: true })
       .limit(limit);
  const { data, error } = await q;
  if (error) { console.error('getBookings(window):', error); return []; }
  return data || [];
}

// All pending bookings for a place, regardless of date. Cheap because most
// places carry a handful of pending rows at any moment.
async function _fetchPendingBookings(placeId) {
  const { data, error } = await _sb
    .from('bookings').select('*')
    .eq('place_id', placeId).eq('status', 'pending')
    .order('booked_date', { ascending: true })
    .limit(500);
  if (error) { console.error('getBookings(pending):', error); return []; }
  return data || [];
}

function _mergeBookings(...lists) {
  const seen = new Set();
  const out  = [];
  for (const list of lists) {
    for (const row of list) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      out.push(row);
    }
  }
  out.sort((a, b) => (a.booked_date + a.time_slot).localeCompare(b.booked_date + b.time_slot));
  return out.map(_mapBooking);
}

// Dashboard view: recent activity (last 7 days through next 7 days) plus
// any pending booking. Enough to compute today's stats, the week chart,
// and the "recent" table — and bounded so a long-running business doesn't
// silently fall off the 1000-row cliff.
async function getDashboardBookings(placeId) {
  const today  = todayStr();
  const sevenAgo  = new Date(); sevenAgo.setDate(sevenAgo.getDate() - 7);
  const sevenAhead = new Date(); sevenAhead.setDate(sevenAhead.getDate() + 7);
  const since = `${sevenAgo.getFullYear()}-${_pad(sevenAgo.getMonth()+1)}-${_pad(sevenAgo.getDate())}`;
  const until = `${sevenAhead.getFullYear()}-${_pad(sevenAhead.getMonth()+1)}-${_pad(sevenAhead.getDate())}`;
  void today;
  const [windowRows, pending] = await Promise.all([
    _fetchBookingsBounded({ placeId, sinceDate: since, untilDate: until, limit: 500 }),
    _fetchPendingBookings(placeId),
  ]);
  return _mergeBookings(windowRows, pending);
}

// Bookings page view: the month currently visible in the calendar plus all
// pending bookings (so the pending chip remains accurate across months).
// Caller refetches on month change.
async function getMonthBookings(placeId, year, month /* 0-indexed */) {
  const since = `${year}-${_pad(month + 1)}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const until = `${year}-${_pad(month + 1)}-${_pad(lastDay)}`;
  const [windowRows, pending] = await Promise.all([
    _fetchBookingsBounded({ placeId, sinceDate: since, untilDate: until, limit: 1000 }),
    _fetchPendingBookings(placeId),
  ]);
  return _mergeBookings(windowRows, pending);
}

async function updateBookingStatus(id, status) {
  const { error } = await _sb.from('bookings').update({ status }).eq('id', id);
  return error;
}

// Confirms a booking and fires the notify-guest edge function to push-notify + SMS the guest.
async function confirmAndNotify(id) {
  const err = await updateBookingStatus(id, 'confirmed');
  if (err) return err;
  const { error: fnErr } = await _sb.functions.invoke('notify-guest', { body: { bookingId: id } });
  if (fnErr) console.warn('notify-guest:', fnErr);
  return null;
}

// Best-effort recovery for guests whose notify-guest dispatch never landed.
// notify-guest stamps bookings.guest_notified_at only when at least one
// channel (SMS or push) acknowledged. If Twilio was down, the function 500'd,
// or the portal lost its connection mid-call, that timestamp stays NULL and
// the guest is left wondering whether their booking was actually confirmed.
//
// On bookings-page load we sweep the place's recent confirmed/cancelled rows
// and re-invoke notify-guest for any with a NULL stamp. We cap the lookback at
// 24h because anything older has likely already been resolved out-of-band, and
// we cap concurrent re-invokes at 5 to avoid hammering the function on first
// load after a long Twilio outage.
async function retryStuckGuestNotify(placeId) {
  if (!placeId) return;
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await _sb
      .from('bookings')
      .select('id')
      .eq('place_id', placeId)
      .in('status', ['confirmed', 'cancelled'])
      .is('guest_notified_at', null)
      .gte('created_at', since)
      .limit(5);
    if (error || !data || !data.length) return;
    // Sequential, not Promise.all, so a slow function doesn't pile up calls.
    for (const row of data) {
      const { error: fnErr } = await _sb.functions.invoke('notify-guest', { body: { bookingId: row.id } });
      if (fnErr) console.warn('notify-guest retry:', fnErr);
    }
  } catch (e) {
    console.warn('retryStuckGuestNotify:', e);
  }
}

// Best-effort recovery for pending bookings whose notify-booking dispatch never
// landed. Mirrors retryStuckGuestNotify but targets the owner side: finds pending
// rows with owner_notified_at = NULL created in the last 24 h and re-invokes
// notify-booking for each. The edge function now accepts the business owner's JWT
// (in addition to service-role and the guest's JWT) so this call succeeds.
async function retryStuckOwnerNotify(placeId) {
  if (!placeId) return;
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await _sb
      .from('bookings')
      .select('id')
      .eq('place_id', placeId)
      .eq('status', 'pending')
      .is('owner_notified_at', null)
      .gte('created_at', since)
      .limit(5);
    if (error || !data || !data.length) return;
    // Sequential, not Promise.all, to avoid hammering the function on first load
    // after a long Twilio outage.
    for (const row of data) {
      const { error: fnErr } = await _sb.functions.invoke('notify-booking', { body: { bookingId: row.id } });
      if (fnErr) console.warn('notify-booking owner retry:', fnErr);
    }
  } catch (e) {
    console.warn('retryStuckOwnerNotify:', e);
  }
}

// Declines a booking and notifies the guest with the "cancelled" branch.
// Note: DB CHECK constraint requires the British spelling 'cancelled' (double-l).
// Older portal builds wrote 'canceled' which the DB silently rejected.
//
// If the booking has a QPay deposit (paymentId set), we route through the
// cancel-booking edge function which handles the time-based refund policy.
// Pass reason='no_show' to keep the deposit regardless of timing.
async function cancelAndNotify(id, reason, { depositAmount, paymentId } = {}) {
  if (depositAmount != null && paymentId) {
    // Edge function handles status update + optional QPay refund + notify-booking
    const { error } = await _sb.functions.invoke('cancel-booking', {
      body: { bookingId: id, reason: reason || 'user_cancel' },
    });
    if (error) return error;
    // Also notify guest of cancellation
    const { error: fnErr } = await _sb.functions.invoke('notify-guest', { body: { bookingId: id, reason } });
    if (fnErr) console.warn('notify-guest:', fnErr);
    return null;
  }
  // Standard free booking — direct DB update
  const err = await updateBookingStatus(id, 'cancelled');
  if (err) return err;
  const { error: fnErr } = await _sb.functions.invoke('notify-guest', { body: { bookingId: id, reason } });
  if (fnErr) console.warn('notify-guest:', fnErr);
  return null;
}

// _ownerId is unused (kept for call-site compatibility with dashboard/bookings)
async function addPortalBooking(placeId, _ownerId, { client, phone, service, date, time, duration, partySize, note }) {
  const { error } = await _sb.from('bookings').insert({
    place_id:         placeId,
    booked_date:      date,
    time_slot:        time,
    party_size:       partySize || 1,
    guest_name:       client || null,
    guest_phone:      phone  || null,
    service:          service || null,
    duration_minutes: duration ? parseInt(duration, 10) || null : null,
    note:             note || null,
    status:           'confirmed',
  });
  return error;
}

// ── Status display ──
function statusLabel(s) {
  return { confirmed: 'Баталгаажсан', pending: 'Хүлээгдэж буй', canceled: 'Цуцлагдсан', cancelled: 'Цуцлагдсан', expired: 'Хугацаа дууссан' }[s] || s;
}
function statusBadge(s) {
  const cls = { confirmed: 'badge-success', pending: 'badge-warning', canceled: 'badge-danger', cancelled: 'badge-danger', expired: 'badge-gray' };
  return `<span class="badge ${cls[s] || 'badge-gray'}">${statusLabel(s)}</span>`;
}

// ── Date helpers ──
function _pad(n) { return String(n).padStart(2, '0'); }
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${_pad(d.getMonth()+1)}-${_pad(d.getDate())}`;
}
function tomorrowStr() {
  const d = new Date(); d.setDate(d.getDate()+1);
  return `${d.getFullYear()}-${_pad(d.getMonth()+1)}-${_pad(d.getDate())}`;
}
function dayAfterStr() {
  const d = new Date(); d.setDate(d.getDate()+2);
  return `${d.getFullYear()}-${_pad(d.getMonth()+1)}-${_pad(d.getDate())}`;
}
function formatDate(str) {
  const d = new Date(str + 'T00:00:00');
  const months = ['1-р сар','2-р сар','3-р сар','4-р сар','5-р сар','6-р сар',
                  '7-р сар','8-р сар','9-р сар','10-р сар','11-р сар','12-р сар'];
  return `${d.getFullYear()} он, ${months[d.getMonth()]} ${d.getDate()}-ны өдөр`;
}
function relativeDate(str) {
  if (str === todayStr()) return 'Өнөөдөр';
  if (str === tomorrowStr()) return 'Маргааш';
  return formatDate(str);
}

// ── Sidebar ──
function setActiveSidebarLink() {
  const page = window.location.pathname.split('/').pop();
  document.querySelectorAll('.sidebar-nav a').forEach(a => {
    if (a.getAttribute('href') === page) a.classList.add('active');
  });
}
function initMobileSidebar() {
  const btn      = document.getElementById('mobileMenuBtn');
  const sidebar  = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  if (!btn || !sidebar) return;
  btn.addEventListener('click',      () => { sidebar.classList.add('open'); backdrop.classList.add('open'); });
  backdrop.addEventListener('click', () => { sidebar.classList.remove('open'); backdrop.classList.remove('open'); });
}

// ── Shared logout ──
// Works for both <button onclick="logout()"> (no event) and legacy
// <a onclick="logout(event)"> callers. We use `.finally()` so the local
// session state is cleared and the redirect runs even when signOut() throws
// (network drop, CSP block on the auth endpoint, etc.) — otherwise a failed
// signOut would leave the user authenticated locally with no UI feedback.
function logout(e) {
  if (e && typeof e.preventDefault === 'function') e.preventDefault();
  const cleanup = () => {
    localStorage.removeItem('mm_biz');
    localStorage.removeItem('mm_pending_reg');
    localStorage.removeItem('mm_push_dismissed');
    localStorage.removeItem('mm_last_active');
    window.location.href = 'login.html';
  };
  try {
    const p = _sb.auth.signOut();
    if (p && typeof p.finally === 'function') p.finally(cleanup);
    else cleanup();
  } catch (_) {
    cleanup();
  }
}

// ── Notification badge ──
// Calls the failed_notifications_count_for_owner RPC (added in migration
// 20260517000002) and updates the #notifBadge element if present on the page.
// Failures are silent — a missing RPC or auth glitch should never break the
// surrounding page. Call this opportunistically from any authenticated page.
async function loadNotifBadge() {
  const el = document.getElementById('notifBadge');
  if (!el) return;
  try {
    const { data, error } = await _sb.rpc('failed_notifications_count_for_owner');
    if (error) return;
    const n = Number(data ?? 0);
    if (n > 0) {
      el.textContent = String(n);
      el.style.display = 'inline-flex';
    } else {
      el.style.display = 'none';
    }
  } catch (_) {
    // No-op; the badge stays hidden and the user can still navigate to
    // notifications.html to see the truth.
  }
}

// Poll the badge on a 60s cadence so an owner who leaves the dashboard open
// sees fresh failure counts without refreshing. We pause polling when the
// tab is hidden (visibilitychange) to avoid burning Supabase RPC quota for
// nothing, and resume immediately when the tab comes back. Only one timer
// runs per page — calling startNotifBadgePolling again is a no-op.
let _notifBadgeTimer = null;
function startNotifBadgePolling(intervalMs = 60_000) {
  if (_notifBadgeTimer) return;
  const tick = () => { if (!document.hidden) loadNotifBadge(); };
  _notifBadgeTimer = setInterval(tick, intervalMs);

  // Refresh immediately whenever the user un-hides the tab. Without this,
  // returning to a backgrounded tab would show stale data until the next
  // 60s mark.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) loadNotifBadge();
  });
}

// ── Theme (dark mode) ──
// We apply the saved theme *synchronously* on script load to avoid a flash of
// the wrong palette. The CSS overrides only token variables, so no per-page
// dark CSS is needed. Call applyTheme(...) to switch, toggleTheme() to flip,
// or wireThemeToggle('#myBtn') to bind a button.
const THEME_KEY = 'mm_theme';
function applyTheme(theme) {
  const t = theme === 'dark' ? 'dark' : 'light';
  if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  else              document.documentElement.removeAttribute('data-theme');
  try { localStorage.setItem(THEME_KEY, t); } catch (_) {}
}
function currentTheme() {
  try { return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'; }
  catch (_) { return 'light'; }
}
function toggleTheme() {
  applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
}
function wireThemeToggle(selector) {
  const el = typeof selector === 'string' ? document.querySelector(selector) : selector;
  if (!el) return;
  el.addEventListener('click', toggleTheme);
}
// Apply on load — runs once when utils.js is parsed, before page render code.
applyTheme(currentTheme());
