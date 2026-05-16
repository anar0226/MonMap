# MonMap Deployment Runbook

End-to-end procedure for taking the MonMap stack (mobile app + web portal +
Supabase backend) from a clean Supabase project to a fully operational
production deployment.

If you are recovering from an incident and don't know which step failed,
jump to [Verification](#7-verification--smoke-tests) and work backwards.

---

## Architecture at a glance

| Layer | Where it lives | How it deploys |
|---|---|---|
| Mobile app | `src/` (Expo / React Native) | `expo build` → App Store / Play Store / EAS Update |
| Business portal | `monmap-portal/` (static HTML/CSS/JS) | Any static host (Netlify, Vercel, Cloudflare Pages, S3+CloudFront) |
| Database + auth + storage | Supabase project | `supabase db push` |
| Server logic | `supabase/functions/*` (Deno) | `supabase functions deploy` |
| Scheduled jobs | `pg_cron` + `pg_net` | One-time SQL call (see step 5) |

---

## 1. Prerequisites

Install once on the deploy machine:

```bash
# Supabase CLI ≥ 1.200
npm install -g supabase
# OR (recommended) install via Scoop / Homebrew so it stays current
scoop install supabase     # Windows
brew install supabase/tap/supabase   # macOS

# Expo CLI for mobile builds
npm install -g eas-cli
```

Have on hand:

- **Supabase project ref** (e.g. `brykoxmygtiyrssmsvys`) — from the project URL
- **Supabase service-role key** — Dashboard → Settings → API
- **QPay merchant credentials** (sandbox + prod) — from QPay onboarding
- **Twilio account** with a Mongolia-capable sender (alphanumeric or +976 number)
- **VAPID keypair** for Web Push — generate with `npx web-push generate-vapid-keys`
- **hCaptcha site key + secret** — from hcaptcha.com dashboard
- **Mapbox access token** — from account.mapbox.com
- **(Optional) Sentry DSN or webhook URL** for error alerting — see step 4

---

## 2. Database migrations

Migrations live in `supabase/migrations/` and apply in filename order
(`YYYYMMDDHHMMSS_description.sql`). They are idempotent where possible but
**must run in order from a clean project** for foreign keys to resolve.

```bash
supabase link --project-ref <YOUR_PROJECT_REF>
supabase db push
```

To inspect what would run without applying:

```bash
supabase db diff
```

If you are starting from an already-populated database, `supabase db push`
will apply only the migrations after the last `schema_migrations` entry.
Never edit a migration file after it has been applied to production —
write a follow-up migration instead.

---

## 3. Required secrets

Set every secret listed below before deploying edge functions. Missing secrets
cause silent runtime failures (Twilio sends nothing, QPay invoices fail to
generate, cron jobs reject as unauthorized, etc.).

```bash
# Use this template — paste each value and run it line by line, or create
# a .env file and pipe through `xargs -I {} supabase secrets set {}`.

supabase secrets set \
  QPAY_CLIENT_ID="..." \
  QPAY_CLIENT_SECRET="..." \
  QPAY_INVOICE_CODE="..." \
  TWILIO_ACCOUNT_SID="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  TWILIO_AUTH_TOKEN="..." \
  TWILIO_FROM_NUMBER="MONMAP" \
  VAPID_PUBLIC_KEY="B..." \
  VAPID_PRIVATE_KEY="..." \
  VAPID_SUBJECT="mailto:ops@monmap.mn" \
  PORTAL_URL="https://portal.monmap.mn" \
  SUPPORT_PHONE="+976 9414-2121" \
  CRON_SECRET="$(openssl rand -hex 32)" \
  DEPLOY_ENV="production"

# Optional — at least one of these enables external error alerting.
# Pick one; the function auto-detects which sink to use:
supabase secrets set SENTRY_DSN="https://<key>@<region>.ingest.sentry.io/<project>"
# ── OR ──
supabase secrets set ERROR_WEBHOOK_URL="https://hooks.slack.com/services/..."
# ── OR ──
supabase secrets set ERROR_WEBHOOK_URL="https://discord.com/api/webhooks/..."
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are
**auto-populated** by Supabase — never set those yourself.

**Verify** with:

```bash
supabase secrets list
```

You should see 12 names (15 if you set the optional ones). If any are missing,
the corresponding feature will silently fail — see the table in step 7.

---

## 4. Deploy edge functions

```bash
# Deploy all eleven functions in one shot
supabase functions deploy \
  cancel-booking \
  check-payment-status \
  create-payment-intent \
  delete-account \
  expire-bookings \
  notify-booking \
  notify-guest \
  payment-webhook \
  send-reminders \
  transit-route \
  web-push-notify
```

Each function has a `--no-verify-jwt` mode if it's intentionally public
(e.g. `payment-webhook` is called by QPay's servers, not our users). Check
the source comment at the top of each `index.ts` for whether to add the flag.

---

## 5. Enable pg_cron and schedule the jobs

Two cron jobs **must** be running for the system to behave correctly:

| Job | Interval | Without it |
|---|---|---|
| `expire-pending-bookings` | every 5 min | Pending bookings sit forever; slot holds never release |
| `send-booking-reminders` | every 30 min | Owners get no upcoming-booking SMS reminders |

The migration `20260510000002_setup_booking_crons.sql` creates a helper
function `public.setup_booking_crons(...)` that wires both jobs in one call.

**Run this once in the Supabase SQL editor**:

```sql
-- Enable extensions if not already (idempotent)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Register both schedules. CRON_SECRET must match the env var you set
-- in step 3 — the edge functions reject calls with a mismatched secret.
SELECT public.setup_booking_crons(
  'https://<YOUR_PROJECT_REF>.supabase.co',
  '<the CRON_SECRET from step 3>'
);
-- Expected return: 'scheduled: expire-pending-bookings (*/5 min), send-booking-reminders (*/30 min)'
```

Re-running is safe — existing schedules are unscheduled first.

**Verify** with:

```sql
SELECT jobname, schedule, active
FROM cron.job
WHERE jobname IN ('expire-pending-bookings', 'send-booking-reminders');
-- Should return 2 rows, both active=true
```

After ~5 minutes, check that the first invocation succeeded:

```sql
SELECT jobname, status, return_message, start_time
FROM cron.job_run_details
ORDER BY start_time DESC
LIMIT 4;
```

---

## 6. Configure QPay webhook

QPay needs to know where to POST when a payment is captured. The URL is:

```
https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/payment-webhook
```

Set this as the **invoice callback URL** in your QPay merchant dashboard.
The function is idempotent — replays are safe. It returns 200 even on
internal errors so QPay doesn't retry-storm.

---

## 7. Verification / smoke tests

After every deploy, run the smoke tests in **`SMOKE_TESTS.md`**. A summary:

| Check | Expected |
|---|---|
| Portal `/login.html` loads, hCaptcha widget appears | Login button enabled after captcha solve |
| Mobile app launches, map renders POI icons | Pinch-to-zoom works, place taps open detail card |
| Submit a free booking from the app | Booking row created with `status='pending'`, owner gets SMS within 30s |
| Submit a paid booking from the app | QPay QR appears, scan with QPay app → booking created, both owner+guest get SMS |
| Wait 30 min, leave one booking unconfirmed | Status flips to `expired`, guest gets SMS within ~5 min of expiry |
| Trigger an error in `payment-webhook` (e.g. send bad payload) | Sentry/Slack/Discord receives an alert within ~3s |
| Portal `/dashboard.html` shows live booking count | Numbers match `SELECT count(*) FROM bookings` |

---

## 8. Static hosting (portal)

The `monmap-portal/` directory is pure static HTML/CSS/JS. No build step.

```bash
# Netlify
netlify deploy --dir=monmap-portal --prod

# Vercel
vercel --prod monmap-portal

# Cloudflare Pages
wrangler pages publish monmap-portal --project-name=monmap-portal
```

Set the same `PORTAL_URL` env var in step 3 to the final URL so SMS
notifications link back correctly.

---

## 9. Mobile app build

```bash
# Set env vars in eas.json (or app.config.ts) before building:
#   EXPO_PUBLIC_SUPABASE_URL
#   EXPO_PUBLIC_SUPABASE_ANON_KEY
#   EXPO_PUBLIC_MAPBOX_TOKEN
#   EXPO_PUBLIC_HCAPTCHA_SITE_KEY

eas build --platform all --profile production
eas submit --platform all
```

For over-the-air JS updates (no store review):

```bash
eas update --channel production --message "..."
```

---

## 10. Disaster recovery checklist

If the system stops working in production, walk this list:

1. **Cron jobs running?** → `SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;`
2. **Edge functions responding?** → `curl https://<ref>.supabase.co/functions/v1/check-payment-status` (should 401 — that's correct, means the function is reachable)
3. **Secrets all set?** → `supabase secrets list` — compare against step 3
4. **External alerts firing?** → Check Sentry/Slack/Discord for the last hour
5. **Recent notification failures?**

   ```sql
   SELECT channel, error_text, attempted_at
   FROM notification_attempts
   WHERE status = 'error' AND attempted_at > now() - interval '1 hour'
   ORDER BY attempted_at DESC;
   ```
6. **Stuck bookings?**

   ```sql
   SELECT id, status, created_at, owner_notified_at, guest_notified_at
   FROM bookings
   WHERE status = 'pending' AND created_at < now() - interval '1 hour';
   -- Should be empty — expire-bookings cron should have flipped these
   ```
7. **Slot holds piling up?**

   ```sql
   SELECT count(*) FROM slot_holds WHERE expires_at < now();
   -- Should be 0 — expire-bookings cleans these
   ```

---

## Appendix: secrets quick reference

| Secret | Required? | Owner | Rotate by |
|---|---|---|---|
| `QPAY_CLIENT_ID` | ✓ | QPay | QPay dashboard |
| `QPAY_CLIENT_SECRET` | ✓ | QPay | QPay dashboard |
| `QPAY_INVOICE_CODE` | ✓ | QPay | QPay dashboard |
| `TWILIO_ACCOUNT_SID` | ✓ | Twilio | Twilio console |
| `TWILIO_AUTH_TOKEN` | ✓ | Twilio | Twilio console |
| `TWILIO_FROM_NUMBER` | ✓ | Twilio | Twilio console |
| `VAPID_PUBLIC_KEY` | ✓ | Self | `npx web-push generate-vapid-keys` (must rotate both keys together; invalidates all push subscriptions) |
| `VAPID_PRIVATE_KEY` | ✓ | Self | Same as above |
| `VAPID_SUBJECT` | ✓ | Self | Any contact email |
| `PORTAL_URL` | ✓ | Self | Update when portal moves |
| `SUPPORT_PHONE` | optional | Self | Defaults to `+976 9414-2121` |
| `CRON_SECRET` | ✓ | Self | Re-run `setup_booking_crons` after rotating |
| `DEPLOY_ENV` | optional | Self | Used as a Sentry tag — defaults to `production` |
| `SENTRY_DSN` | optional | Sentry | Sentry project settings (rotates entire key) |
| `ERROR_WEBHOOK_URL` | optional | Slack/Discord | Re-create the webhook in the channel |

---

## Appendix: Mobile platform floors

### Android — minimum API level 24 (Android 7.0)

This is the Expo SDK 54 default and **must not be lowered**. The
`secureStorage` adapter (`src/lib/secureStorage.ts`) uses
`expo-secure-store`, which depends on Android `EncryptedSharedPreferences`
for at-rest encryption. That API requires **Android 6.0 (API 23)** as a
hard floor; below that, expo-secure-store silently falls back to plaintext
SharedPreferences, defeating the migration off AsyncStorage.

`secureStorage` detects API < 23 at runtime and routes to plain
AsyncStorage with a `__DEV__` warning — sign-in still works but the
encryption guarantee is gone. If you ever see this warning in production
logs, raise `minSdkVersion`.

If you add `expo-build-properties` and set `android.minSdkVersion`
explicitly, **keep it at 24 or above**. Going lower silently weakens the
security model for every Android user.

### iOS — no floor concern

`expo-secure-store` uses iOS Keychain on every supported iOS version. No
runtime branch needed.
