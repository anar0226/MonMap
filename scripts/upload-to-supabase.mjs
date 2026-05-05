/**
 * Uploads scraped businesses from data/businesses.json to the `places` table.
 *
 * Usage:
 *   node scripts/upload-to-supabase.mjs
 *   node scripts/upload-to-supabase.mjs --dry-run   (validate only, no inserts)
 *
 * Requires in .env (or .env.local):
 *   EXPO_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   ← service role key (not anon), bypasses RLS
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DRY_RUN = process.argv.includes('--dry-run');

// ─── Config ───────────────────────────────────────────────────────────────────

function loadEnv() {
  const env = {};
  for (const name of ['.env', '.env.local']) {
    const p = path.join(ROOT, name);
    if (fs.existsSync(p)) {
      for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
        const [key, ...rest] = line.split('=');
        if (key && rest.length) env[key.trim()] = rest.join('=').trim();
      }
    }
  }
  return {
    url:            process.env.EXPO_PUBLIC_SUPABASE_URL  ?? env['EXPO_PUBLIC_SUPABASE_URL'],
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? env['SUPABASE_SERVICE_ROLE_KEY'],
  };
}

const { url: SUPABASE_URL, serviceRoleKey: SERVICE_KEY } = loadEnv();
const BATCH_SIZE = 100;

// ─── Supabase REST helper ─────────────────────────────────────────────────────

async function supabaseUpsert(table, rows, conflictColumn) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?on_conflict=${conflictColumn}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Prefer': 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase error (${res.status}): ${text}`);
  }
}

// ─── Transform for places schema ─────────────────────────────────────────────

function toPlaceRow(b) {
  // Convert the hours array to the JSONB structure places.regular_opening_hours expects.
  // Each entry has { day_of_week, open_time, close_time, is_closed }.
  // We store it as-is; the app reads it via the OpeningHours type.
  const regularOpeningHours = b.hours?.length
    ? { weekday_descriptions: b.hours.map(h => {
        if (h.is_closed) return 'Хаалттай';
        return `${h.open_time ?? ''} – ${h.close_time ?? ''}`;
      }) }
    : null;

  return {
    place_id:              b.external_id,
    name:                  b.name,
    primary_category:      b.primary_category ?? null,
    types:                 b.google_types ?? [],
    location:              `SRID=4326;POINT(${b.longitude} ${b.latitude})`,
    lat:                   b.latitude,
    lng:                   b.longitude,
    formatted_address:     b.address ?? null,
    phone_intl:            b.phone ?? null,
    regular_opening_hours: regularOpeningHours,
    business_status:       b.is_active ? 'OPERATIONAL' : 'CLOSED_PERMANENTLY',
    raw:                   b,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const dataPath = path.join(ROOT, 'data', 'businesses.json');
if (!fs.existsSync(dataPath)) {
  console.error('❌ data/businesses.json not found. Run scrape-places.mjs first.');
  process.exit(1);
}

const businesses = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

console.log('\n📤 MonMap — Supabase Uploader');
console.log('═══════════════════════════════');
console.log(`Records to upload : ${businesses.length}`);
console.log(`Supabase URL      : ${SUPABASE_URL ?? '(missing)'}`);
console.log(`Target table      : places`);

if (DRY_RUN) {
  console.log('\n✅ Dry run — validating records…');
  const missing = businesses.filter(b => !b.name || !b.external_id);
  console.log(`  ${businesses.length - missing.length} valid, ${missing.length} missing name/id`);
  const withPhone   = businesses.filter(b => b.phone).length;
  const withHours   = businesses.filter(b => b.hours?.length).length;
  const withLatLng  = businesses.filter(b => b.latitude && b.longitude).length;
  console.log(`  ${withPhone} have phone numbers`);
  console.log(`  ${withHours} have opening hours`);
  console.log(`  ${withLatLng} have coordinates`);
  const cats = [...new Set(businesses.map(b => b.primary_category).filter(Boolean))];
  console.log(`  ${cats.length} primary categories`);
  process.exit(0);
}

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('\n❌ Missing Supabase credentials. Add to .env:\n   EXPO_PUBLIC_SUPABASE_URL=...\n   SUPABASE_SERVICE_ROLE_KEY=...\n');
  process.exit(1);
}

// Upsert places in batches
console.log('\n[1/1] Upserting places…');
const placeRows = businesses.map(toPlaceRow);

let uploaded = 0;
let failed   = 0;
for (let i = 0; i < placeRows.length; i += BATCH_SIZE) {
  const batch = placeRows.slice(i, i + BATCH_SIZE);
  try {
    await supabaseUpsert('places', batch, 'place_id');
    uploaded += batch.length;
    process.stdout.write(`\r  ✓ ${uploaded}/${placeRows.length}`);
  } catch (err) {
    failed += batch.length;
    console.error(`\n  ✗ Batch ${i}–${i + BATCH_SIZE}: ${err.message}`);
  }
}
console.log();

console.log(`\n✅ Upload complete!`);
console.log(`   ${uploaded} places upserted`);
if (failed) console.log(`   ${failed} failed`);
