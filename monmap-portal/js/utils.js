// MonMap Portal — Shared Utilities
// Real DB schema: public.places + public.bookings + public.business_owners

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
      <div class="toast-title">${title}</div>
      ${msg ? `<div class="toast-msg">${msg}</div>` : ''}
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

// ── Auth guard (async) ──
// Returns { session, user, biz } where biz = { id: place_id, name, type, verified }
async function requireAuth() {
  const { data: { session } } = await _sb.auth.getSession();
  if (!session) { window.location.href = 'login.html'; return null; }

  let biz = JSON.parse(localStorage.getItem('mm_biz') || 'null');
  if (!biz) {
    const { data } = await _sb
      .from('business_owners')
      .select('place_id, places(name, primary_category)')
      .eq('user_id', session.user.id)
      .maybeSingle();
    if (data) {
      biz = {
        id:       data.place_id,
        name:     (data.places && data.places.name) || data.place_id,
        type:     (data.places && data.places.primary_category) || 'Бизнес',
        verified: true,
      };
      localStorage.setItem('mm_biz', JSON.stringify(biz));
    }
  }

  return { session, user: session.user, biz: biz || null };
}

// ── Places search (for registration) ──
async function searchPlaces(query) {
  const { data } = await _sb
    .from('places')
    .select('place_id, name, primary_category, formatted_address')
    .ilike('name', `%${query}%`)
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
function _mapBooking(b) {
  const s = (b.status || 'pending');
  const statusNorm = s === 'cancelled' ? 'canceled' : s;
  return {
    id:       b.id,
    client:   b.guest_name  || 'Харилцагч',
    phone:    b.guest_phone || '',
    service:  b.party_size > 1 ? `Захиалга (${b.party_size} хүн)` : 'Захиалга',
    date:     b.booked_date,
    time:     b.time_slot,
    status:   statusNorm,
    duration: 60,
    note:     '',
  };
}

async function getBookings(placeId) {
  const { data, error } = await _sb
    .from('bookings')
    .select('*')
    .eq('place_id', placeId)
    .order('booked_date', { ascending: true })
    .order('time_slot',   { ascending: true });
  if (error) { console.error('getBookings:', error); return []; }
  return (data || []).map(_mapBooking);
}

async function updateBookingStatus(id, status) {
  const { error } = await _sb.from('bookings').update({ status }).eq('id', id);
  return error;
}

// _ownerId is unused (kept for call-site compatibility with dashboard/bookings)
async function addPortalBooking(placeId, _ownerId, { client, phone, date, time, partySize, note }) {
  const { error } = await _sb.from('bookings').insert({
    place_id:    placeId,
    booked_date: date,
    time_slot:   time,
    party_size:  partySize || 1,
    guest_name:  client,
    guest_phone: phone  || null,
    status:      'confirmed',
  });
  return error;
}

// ── Status display ──
function statusLabel(s) {
  return { confirmed: 'Баталгаажсан', pending: 'Хүлээгдэж буй', canceled: 'Цуцлагдсан', cancelled: 'Цуцлагдсан' }[s] || s;
}
function statusBadge(s) {
  const cls = { confirmed: 'badge-success', pending: 'badge-warning', canceled: 'badge-danger', cancelled: 'badge-danger' };
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
    window.location.href = 'login.html';
  });
}
