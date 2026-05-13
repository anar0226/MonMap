#!/usr/bin/env node
// MonMap production smoke tests.
//
// Run after every deploy. Exits 0 if all checks pass, 1 if any fail.
// See SMOKE_TESTS.md for the full procedure.
//
// Usage:
//   SUPABASE_URL=https://xxx.supabase.co \
//   SUPABASE_ANON_KEY=eyJ... \
//   PORTAL_URL=https://portal.monmap.mn \
//   node scripts/smoke-test.mjs
//
// Optional:
//   SUPABASE_SERVICE_ROLE_KEY=...   enables DB-level checks (#7–9)
//   TIMEOUT_MS=5000                 per-check timeout (default 5s)

const {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY,
  PORTAL_URL,
  TIMEOUT_MS = '5000',
} = process.env;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !PORTAL_URL) {
  console.error('FATAL: SUPABASE_URL, SUPABASE_ANON_KEY, and PORTAL_URL are all required.');
  console.error('See the Quickstart in SMOKE_TESTS.md.');
  process.exit(2);
}

const TIMEOUT = Number(TIMEOUT_MS);

// Tiny fetch wrapper with timeout — Node 18+ has fetch but no AbortSignal.timeout
// shorthand on older 18.x. Roll our own for portability.
async function fetchWithTimeout(url, opts = {}) {
  const ctrl = new AbortController();
  const tm = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(tm);
  }
}

// Each check returns { ok, label, detail, hint? }. hint is shown only on failure.
const CHECKS = [
  // ── Portal availability ──
  async () => {
    const res = await fetchWithTimeout(`${PORTAL_URL}/login.html`);
    const ok = res.ok;
    const size = Number(res.headers.get('content-length') || 0);
    return {
      ok,
      label: 'portal/login.html loads',
      detail: `${res.status}${size ? `, ${(size / 1024).toFixed(1)} kB` : ''}`,
      hint: 'Re-deploy the portal or fix the host config — see DEPLOYMENT.md §8',
    };
  },
  async () => {
    const res = await fetchWithTimeout(`${PORTAL_URL}/dashboard.html`);
    return {
      ok: res.ok,
      label: 'portal/dashboard.html loads',
      detail: `${res.status}`,
      hint: 'Re-deploy the portal — see DEPLOYMENT.md §8',
    };
  },

  // ── Supabase project reachable ──
  async () => {
    const res = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/`, {
      headers: { apikey: SUPABASE_ANON_KEY },
    });
    return {
      ok: res.ok,
      label: 'supabase REST root reachable',
      detail: `${res.status}`,
      hint: 'Check Supabase dashboard — project may be paused/destroyed',
    };
  },

  // ── Edge function auth checks (these should *fail* with 401 for unauthed calls) ──
  async () => {
    const res = await fetchWithTimeout(`${SUPABASE_URL}/functions/v1/check-payment-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentId: 'smoke-test' }),
    });
    return {
      ok: res.status === 401,
      label: 'edge: check-payment-status enforces auth',
      detail: `expected 401, got ${res.status}`,
      hint: 'Function was deployed without auth — re-check source and redeploy',
    };
  },
  async () => {
    const res = await fetchWithTimeout(`${SUPABASE_URL}/functions/v1/create-payment-intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    return {
      ok: res.status === 401,
      label: 'edge: create-payment-intent enforces auth',
      detail: `expected 401, got ${res.status}`,
      hint: 'Function was deployed without auth — re-check source and redeploy',
    };
  },

  // ── transit-route smoke ──
  // UB known coords: Sukhbaatar Square → Zaisan Hill (~5 km)
  async () => {
    const res = await fetchWithTimeout(`${SUPABASE_URL}/functions/v1/transit-route`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        from_lng: 106.9176, from_lat: 47.9184,
        to_lng:   106.9069, to_lat:   47.8866,
      }),
    });
    if (!res.ok) {
      return {
        ok: false,
        label: 'edge: transit-route returns legs',
        detail: `HTTP ${res.status}`,
        hint: 'USCC bus API may be down — function caches per-month, retry in a few min',
      };
    }
    const body = await res.json();
    const legCount = Array.isArray(body?.legs) ? body.legs.length : 0;
    // degraded=true means the cached-fallback path served the response (USCC
    // is down). Treat as a warning, not a failure — driving directions still
    // work. The label includes the flag so operators see it in CI logs.
    const degraded = body?.degraded === true;
    return {
      ok: legCount > 0 || degraded,
      label: 'edge: transit-route returns legs',
      detail: degraded
        ? `degraded (USCC unreachable, served ${legCount} cached leg(s))`
        : `${legCount} leg(s)`,
      hint: 'USCC API returned no routes for known UB coords — check upstream availability',
    };
  },

  // ── transit-route timeout shape check ──
  // Verify the function actually has the timeout wired in by sending a
  // malformed request and asserting we get a structured error <8s. If the
  // function still uses an unbounded fetch, this test would hang on slow
  // USCC days instead of failing fast.
  async () => {
    const t0 = Date.now();
    const res = await fetchWithTimeout(`${SUPABASE_URL}/functions/v1/transit-route`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({}), // missing coords → 400
    });
    const elapsed = Date.now() - t0;
    return {
      ok: res.status === 400 && elapsed < 8000,
      label: 'edge: transit-route fails fast on bad input',
      detail: `${res.status} in ${elapsed}ms`,
      hint: 'transit-route is hanging on validation — timeout may not be wired in',
    };
  },
];

// DB-level checks (only if service role available)
const DB_CHECKS = [
  // pg_cron schedules present
  async () => {
    const res = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/rpc/smoke_cron_count`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: '{}',
    });
    // If the RPC doesn't exist, fall back to a generic message — operators
    // can still check manually. We don't want to crash the script.
    if (res.status === 404) {
      return {
        ok: true, // not a failure, just a skip
        label: 'cron job rows present',
        detail: 'skipped (smoke_cron_count RPC not installed — check manually with SELECT * FROM cron.job)',
      };
    }
    if (!res.ok) {
      return {
        ok: false,
        label: 'cron job rows present',
        detail: `HTTP ${res.status}`,
        hint: 'Run SELECT public.setup_booking_crons(...) — see DEPLOYMENT.md §5',
      };
    }
    const count = await res.json();
    return {
      ok: count >= 2,
      label: 'cron job rows present',
      detail: `${count} / 2 jobs registered`,
      hint: 'Run SELECT public.setup_booking_crons(...) — see DEPLOYMENT.md §5',
    };
  },

  // No stuck pending bookings older than 1h
  async () => {
    const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const res = await fetchWithTimeout(
      `${SUPABASE_URL}/rest/v1/bookings?status=eq.pending&created_at=lt.${encodeURIComponent(cutoff)}&select=id`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          Prefer: 'count=exact',
          Range: '0-0',
        },
      },
    );
    if (!res.ok) {
      return { ok: false, label: 'no stuck pending bookings', detail: `HTTP ${res.status}` };
    }
    const range = res.headers.get('content-range') || '0/0';
    const total = Number(range.split('/')[1] || 0);
    return {
      ok: total === 0,
      label: 'no stuck pending bookings (older than 1h)',
      detail: `${total} stuck`,
      hint: 'expire-bookings cron may not be running — check cron.job_run_details',
    };
  },

  // No expired slot holds piling up
  async () => {
    const now = new Date().toISOString();
    const res = await fetchWithTimeout(
      `${SUPABASE_URL}/rest/v1/slot_holds?expires_at=lt.${encodeURIComponent(now)}&select=id`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          Prefer: 'count=exact',
          Range: '0-0',
        },
      },
    );
    if (!res.ok) {
      return { ok: false, label: 'no expired slot holds piling up', detail: `HTTP ${res.status}` };
    }
    const range = res.headers.get('content-range') || '0/0';
    const total = Number(range.split('/')[1] || 0);
    return {
      ok: total === 0,
      label: 'no expired slot holds piling up',
      detail: `${total} stale holds`,
      hint: 'expire-bookings cron may not be running — check cron.job_run_details',
    };
  },
];

// ── Runner ──

async function run(check) {
  try {
    return await check();
  } catch (e) {
    return { ok: false, label: '<check threw>', detail: String(e?.message ?? e) };
  }
}

const allChecks = [...CHECKS, ...(SUPABASE_SERVICE_ROLE_KEY ? DB_CHECKS : [])];

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.log('ℹ  SUPABASE_SERVICE_ROLE_KEY not set — skipping DB-level checks (#7–9)');
  console.log('');
}

const results = await Promise.all(allChecks.map(run));

let passed = 0;
for (const r of results) {
  const mark = r.ok ? '✓' : '✗';
  const detail = r.detail ? ` (${r.detail})` : '';
  console.log(`${mark} ${r.label}${detail}`);
  if (!r.ok && r.hint) console.log(`    → ${r.hint}`);
  if (r.ok) passed++;
}

console.log('');
console.log(`${passed} / ${results.length} passed`);

process.exit(passed === results.length ? 0 : 1);
