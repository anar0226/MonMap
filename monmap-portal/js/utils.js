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
      .select('place_id, claim_status, places(name, primary_category)')
      .eq('user_id', session.user.id)
      .maybeSingle();
    if (data) {
      biz = {
        id:           data.place_id,
        name:         (data.places && data.places.name) || data.place_id,
        type:         (data.places && data.places.primary_category) || 'Бизнес',
        claim_status: data.claim_status,
        verified:     data.claim_status === 'verified',
      };
      localStorage.setItem('mm_biz', JSON.stringify(biz));
    }
  }

  return { session, user: session.user, biz: biz || null };
}

// ── Places search (for registration) ──
// Escape ILIKE metacharacters so a user typing `%` doesn't match every row
// and a long pattern with backtracking metacharacters can't DoS the index.
// PostgREST already parameterizes the value (no SQLi risk), but the wildcard
// semantics still need neutralizing inside the user-supplied portion.
function _escapeIlike(s) {
  return String(s).replace(/[\\%_]/g, c => '\\' + c);
}
async function searchPlaces(query) {
  const { data } = await _sb
    .from('places')
    .select('place_id, name, primary_category, formatted_address')
    .ilike('name', `%${_escapeIlike(query)}%`)
    .limit(10);
  return data || [];
}

async function claimPlace(userId, placeId) {
  const { error } = await _sb
    .from('business_owners')
    .upsert({ user_id: userId, place_id: placeId }, { onConflict: 'user_id,place_id' });
  return error;
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
    id:        b.id,
    client:    b.guest_name  || 'Харилцагч',
    phone:     b.guest_phone || '',
    partySize,
    partyText: `${partySize} хүн`,
    date:      b.booked_date,
    time:      b.time_slot,
    status:    statusNorm,
    service:   b.service || '',
    duration:  Math.max(1, parseInt(b.duration_minutes, 10) || 60),
    note:      b.note || '',
  };
}

// Supabase config.toml caps PostgREST at max_rows=1000. The previous
// unbounded getBookings() ordered by booked_date ASC — once a place crossed
// ~1000 lifetime bookings it returned the 1000 *oldest* rows, silently
// dropping recent bookings from every portal page.
//
// Every caller now goes through a purpose-bounded helper. The common pattern:
// always include pending bookings (so the status counter stays accurate even
// when the pending row's date falls outside the window) plus the date slice
// the caller actually renders.

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

// Dashboard: last 7 days + next 7 days + all pending. Enough for today's
// stats, the week chart, and the recent table.
async function getDashboardBookings(placeId) {
  const sevenAgo   = new Date(); sevenAgo.setDate(sevenAgo.getDate() - 7);
  const sevenAhead = new Date(); sevenAhead.setDate(sevenAhead.getDate() + 7);
  const since = `${sevenAgo.getFullYear()}-${_pad(sevenAgo.getMonth()+1)}-${_pad(sevenAgo.getDate())}`;
  const until = `${sevenAhead.getFullYear()}-${_pad(sevenAhead.getMonth()+1)}-${_pad(sevenAhead.getDate())}`;
  const [windowRows, pending] = await Promise.all([
    _fetchBookingsBounded({ placeId, sinceDate: since, untilDate: until, limit: 500 }),
    _fetchPendingBookings(placeId),
  ]);
  return _mergeBookings(windowRows, pending);
}

// Bookings page: the calendar month currently visible + all pending.
// Caller refetches on month navigation.
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

// Declines a booking and notifies the guest with the "cancelled" branch.
// Note: DB CHECK constraint requires the British spelling 'cancelled' (double-l).
// Older portal builds wrote 'canceled' which the DB silently rejected.
async function cancelAndNotify(id, reason) {
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
function logout(e) {
  e.preventDefault();
  _sb.auth.signOut().then(() => {
    localStorage.removeItem('mm_biz');
    localStorage.removeItem('mm_pending_reg');
    localStorage.removeItem('mm_push_dismissed');
    localStorage.removeItem('mm_last_active');
    window.location.href = 'login.html';
  });
}
