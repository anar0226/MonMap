# MonMap Smoke Tests

Run this checklist after every production deploy, every Supabase project
change, and once a week as a passive sanity check. Estimated time: **5–8
minutes** for the automated checks, **15 minutes** if you walk the manual
flow too.

The automated checks live in `scripts/smoke-test.mjs`. Run them first; only
do the manual flow if any automated check fails or you've changed a
user-visible flow.

---

## Quickstart

```bash
# 1. Run the automated checks (requires Node 18+ for built-in fetch)
SUPABASE_URL="https://<ref>.supabase.co" \
SUPABASE_ANON_KEY="<anon key>" \
PORTAL_URL="https://portal.monmap.mn" \
node scripts/smoke-test.mjs
```

A green run looks like:

```
✓ portal/login.html loads (200, 1.2 kB)
✓ portal/dashboard.html loads (200, ...)
✓ supabase REST root reachable
✓ edge: check-payment-status enforces auth (401)
✓ edge: transit-route returns legs for UB coords
✓ edge: create-payment-intent enforces auth (401)
✓ cron job rows present (2/2)
✓ no stuck pending bookings (older than 1h, status=pending)
✓ no expired slot holds piling up
9 / 9 passed
```

Anything that prints `✗` is a P0 — investigate before declaring the deploy
healthy. Each failure prints a one-line hint pointing at the section of
`DEPLOYMENT.md` that owns the fix.

---

## What gets checked

| # | Check | What it proves | Failure means |
|---|---|---|---|
| 1 | Portal `/login.html` returns 200 with CSP header | Static hosting is live, CSP didn't get stripped | Re-deploy the portal or fix the host's header config |
| 2 | Portal `/dashboard.html` returns 200 | Auth-gated pages still ship | Same as #1 |
| 3 | Supabase REST root returns 200 | Project isn't paused/destroyed | Project settings issue — check Supabase dashboard |
| 4 | `check-payment-status` returns 401 unauthenticated | Auth checks haven't regressed | Function was deployed without auth — re-check source |
| 5 | `transit-route` returns >0 legs for known UB coords | UBSmartBus integration is up | USCC API is down (returns `degraded:true` from cache, still passes); function timed out (fails) |
| 6 | `transit-route` rejects bad input in <8 s | 5-second AbortController timeout is wired | Function is hanging on validation — see `supabase/functions/transit-route/index.ts` |
| 7 | `create-payment-intent` returns 401 unauthenticated | Same as #4 | Same as #4 |
| 8 | Cron job rows present | `pg_cron` has both schedules registered | Re-run `SELECT setup_booking_crons(...)` — see DEPLOYMENT.md §5 |
| 9 | No stuck pending bookings older than 1h | `expire-bookings` cron is firing | Cron may not be running — check `cron.job_run_details` |
| 10 | No expired slot holds | Same as #9 | Same as #9 |

Checks #7–9 require the service-role key, which is **not** the anon key.
The script only runs them if `SUPABASE_SERVICE_ROLE_KEY` is also exported.
Leave it unset for read-only smoke runs from CI; set it before running
locally from a trusted machine.

---

## Manual flow tests

These exercise paths the script can't (real payments, real SMS, real push).
Do this checklist for every release candidate before promoting to prod.

### M1. Free booking, end-to-end (~3 min)

1. Open app, sign in with a test account
2. Tap a non-deposit place on the map (e.g. a salon)
3. Tap "Захиалга", pick today's first available slot, party size 2
4. Submit → confirmation message appears with "30-minute response" copy
5. In portal/dashboard.html (logged in as that business owner) → pending count increments
6. Owner phone receives SMS within 30s
7. Click "Confirm" in portal → guest phone + Expo push receives SMS within 30s

### M2. Paid booking, end-to-end (~5 min)

1. Open app, sign in
2. Tap a deposit place (one with `places.deposit_amount > 0`)
3. Same booking flow → QPay modal appears with QR + countdown
4. Open QPay app, scan QR, pay
5. PaymentModal flips to "Төлбөр амжилттай!" (haptic burst fires)
6. Booking appears in dashboard immediately
7. Both owner and guest SMS arrive within 30s

### M3. Expiry flow (~30 min — wait)

1. Submit a booking from app (M1 steps 1–4), do **not** confirm from portal
2. Wait 35 minutes
3. App's "Захиалга" tab shows the booking as `expired`
4. Guest phone receives "couldn't reach venue" SMS

### M4. Cancel flow (~2 min)

1. From M1, confirm a booking
2. Cancel from portal (provide a reason)
3. Guest receives cancellation SMS within 30s
4. If deposit was taken: payment row flips to `refund_pending` or `refunded`

### M5. SecureStore session migration (~2 min, once per device)

After installing a build with the `secureStorage` adapter, verify that
existing users from an AsyncStorage build keep their session:

1. Install the previous build (or use a device that already has the app
   logged in from before the upgrade)
2. Sign in, confirm you reach the Map screen
3. Upgrade to the new build via TestFlight / internal-track / `eas update`
4. Open the app → you should land on the Map screen **without re-authenticating**
5. Open Settings → Sign out → verify sign-in still works on a fresh session

If step 4 fails (user is bounced back to login), the migration path in
`src/lib/secureStorage.ts` did not run. Common causes:
   - SecureStore is structurally unavailable (simulator, very old Android API level)
   - The AsyncStorage key changed shape between Supabase versions — confirm
     `sb-<project_ref>-auth-token` is the key being looked up

### M6. Error alerting (~1 min)

1. From the Supabase dashboard, invoke `payment-webhook` with an empty body:
   ```bash
   curl -X POST https://<ref>.supabase.co/functions/v1/payment-webhook \
     -H "Content-Type: application/json" -d '{}'
   ```
2. Sentry / Slack / Discord receives an alert within ~3s
   - If nothing arrives, check `SENTRY_DSN` or `ERROR_WEBHOOK_URL` is set
   - If both are set, only the Sentry path runs (it takes priority)

---

## Adding new checks

The smoke script is a single Node file with no dependencies (uses built-in
fetch). Add a check by appending to the `CHECKS` array — each entry is an
async function returning `{ ok, label, detail, hint }`. Keep checks fast
(<3s each); slow checks belong in a dedicated synthetic-monitoring service,
not in smoke tests.
