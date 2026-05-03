/**
 * Uploads scraped businesses from data/businesses.json to Supabase.
 *
 * Usage:
 *   node scripts/upload-to-supabase.mjs
 *   node scripts/upload-to-supabase.mjs --dry-run   (validate only, no inserts)
 *
 * Requires in .env.local:
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
    url:             process.env.EXPO_PUBLIC_SUPABASE_URL        ?? env['EXPO_PUBLIC_SUPABASE_URL'],
    serviceRoleKey:  process.env.SUPABASE_SERVICE_ROLE_KEY       ?? env['SUPABASE_SERVICE_ROLE_KEY'],
  };
}

const { url: SUPABASE_URL, serviceRoleKey: SERVICE_KEY } = loadEnv();
const BATCH_SIZE = 100; // rows per upsert call

// ─── Supabase REST helper ─────────────────────────────────────────────────────

async function supabaseUpsert(table, rows, conflictColumn) {
  const url = conflictColumn
    ? `${SUPABASE_URL}/rest/v1/${table}?on_conflict=${conflictColumn}`
    : `${SUPABASE_URL}/rest/v1/${table}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Prefer': 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase error (${res.status}): ${text}`);
  }
  return res.json();
}

async function supabaseInsert(table, rows) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase error (${res.status}): ${text}`);
  }
}

async function supabaseDelete(table, filter) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: 'DELETE',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
    },
  });
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`Supabase delete error (${res.status}): ${text}`);
  }
}

// ─── Transform for Supabase schema ───────────────────────────────────────────

function toBusinessRow(b) {
  return {
    external_id:  b.external_id,
    name:         b.name,
    name_mn:      b.name_mn,
    address:      b.address,
    phone:        b.phone,
    // PostGIS geography point. EWKT with explicit SRID is safest.
    location:     b.latitude && b.longitude
      ? `SRID=4326;POINT(${b.longitude} ${b.latitude})`
      : null,
    is_active:    b.is_active,
    is_verified:  false,
    source:       'google_places',
    // category_id resolved separately after category upsert
  };
}

function toCategoryRow(b) {
  return {
    name:    b.category_name,
    name_mn: b.category_name_mn,
    icon:    b.category_icon,
  };
}

function toHoursRows(businessId, hours) {
  return hours.map(h => ({
    business_id: businessId,
    day_of_week: h.day_of_week,
    open_time:   h.open_time,
    close_time:  h.close_time,
    is_closed:   h.is_closed,
  }));
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

if (DRY_RUN) {
  console.log('\n✅ Dry run — validating records…');
  const missing = businesses.filter(b => !b.name || !b.external_id);
  console.log(`  ${businesses.length - missing.length} valid, ${missing.length} missing name/id`);
  const withPhone = businesses.filter(b => b.phone).length;
  const withHours = businesses.filter(b => b.hours?.length).length;
  console.log(`  ${withPhone} have phone numbers`);
  console.log(`  ${withHours} have opening hours`);
  const categories = [...new Set(businesses.map(b => b.category_name))];
  console.log(`  ${categories.length} categories: ${categories.join(', ')}`);
  process.exit(0);
}

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('\n❌ Missing Supabase credentials. Add to .env.local:\n   EXPO_PUBLIC_SUPABASE_URL=...\n   SUPABASE_SERVICE_ROLE_KEY=...\n');
  process.exit(1);
}

// Step 1: Upsert categories, get back their IDs
console.log('\n[1/3] Upserting categories…');
const uniqueCategories = [...new Map(
  businesses.map(b => [b.category_name, toCategoryRow(b)])
).values()];

let categoryRows;
try {
  categoryRows = await supabaseUpsert('categories', uniqueCategories, 'name');
  console.log(`  ✓ ${categoryRows.length} categories`);
} catch (err) {
  console.error(`  ✗ ${err.message}`);
  process.exit(1);
}

const categoryIdByName = Object.fromEntries(categoryRows.map(r => [r.name, r.id]));

// Step 2: Upsert businesses in batches
console.log('\n[2/3] Upserting businesses…');
const businessRows = businesses.map(b => ({
  ...toBusinessRow(b),
  category_id: categoryIdByName[b.category_name] ?? null,
}));

let uploadedCount = 0;
let insertedBusinesses = [];
for (let i = 0; i < businessRows.length; i += BATCH_SIZE) {
  const batch = businessRows.slice(i, i + BATCH_SIZE);
  try {
    const result = await supabaseUpsert('businesses', batch, 'external_id');
    insertedBusinesses.push(...result);
    uploadedCount += batch.length;
    process.stdout.write(`\r  ✓ ${uploadedCount}/${businessRows.length}`);
  } catch (err) {
    console.error(`\n  ✗ Batch ${i}–${i + BATCH_SIZE}: ${err.message}`);
  }
}
console.log();

// Step 3: Replace business_hours (delete existing, then insert fresh)
console.log('\n[3/3] Replacing business hours…');
const externalIdToDbId = Object.fromEntries(insertedBusinesses.map(r => [r.external_id, r.id]));

// Delete existing hours for these businesses, then bulk-insert
const businessDbIds = Object.values(externalIdToDbId).filter(Boolean);
if (businessDbIds.length > 0) {
  // PostgREST `in.()` filter, chunked to avoid URL length limits
  const DELETE_CHUNK = 50;
  for (let i = 0; i < businessDbIds.length; i += DELETE_CHUNK) {
    const ids = businessDbIds.slice(i, i + DELETE_CHUNK).join(',');
    await supabaseDelete('business_hours', `business_id=in.(${ids})`);
  }
}

const allHoursRows = businesses.flatMap(b => {
  const dbId = externalIdToDbId[b.external_id];
  return dbId ? toHoursRows(dbId, b.hours ?? []) : [];
});

let hoursCount = 0;
for (let i = 0; i < allHoursRows.length; i += BATCH_SIZE) {
  const batch = allHoursRows.slice(i, i + BATCH_SIZE);
  try {
    await supabaseInsert('business_hours', batch);
    hoursCount += batch.length;
    process.stdout.write(`\r  ✓ ${hoursCount}/${allHoursRows.length}`);
  } catch (err) {
    console.error(`\n  ✗ Hours batch ${i}: ${err.message}`);
  }
}
console.log();

console.log(`\n✅ Upload complete!`);
console.log(`   ${uploadedCount} businesses`);
console.log(`   ${hoursCount} opening hours rows`);
