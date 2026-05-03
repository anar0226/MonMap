/**
 * Google Places Text Search scraper for UB apartment buildings.
 *
 * Google Places has no direct `apartments` type, so we search by Mongolian
 * text queries ("орон сууц", "хороолол") across a grid and filter to
 * residential results. Uploads to the same `places` table as scrape-osm.mjs.
 *
 * Usage:
 *   node scripts/scrape-apartments.mjs                 (full run)
 *   node scripts/scrape-apartments.mjs --dry-run       (transform + count, no upload)
 *   node scripts/scrape-apartments.mjs --use-cached    (skip API, use data/raw_apartments.json)
 *
 * Requires in .env or .env.local:
 *   GOOGLE_PLACES_API_KEY
 *   EXPO_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Output:
 *   data/raw_apartments.json  — raw API responses
 *   data/apartments.json      — transformed place rows ready for Supabase
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DRY_RUN    = process.argv.includes('--dry-run');
const USE_CACHED = process.argv.includes('--use-cached');

// ─── Config ──────────────────────────────────────────────────────────────────

// Same grid as scrape-places.mjs — 12 points covering UB urban area
const GRID_POINTS = [
  [47.922, 106.855], [47.922, 106.920], [47.922, 106.985],
  [47.900, 106.845], [47.900, 106.915], [47.900, 106.985],
  [47.875, 106.845], [47.875, 106.915], [47.875, 106.985],
  [47.850, 106.855], [47.850, 106.920], [47.850, 106.985],
];

// Text queries that surface apartment buildings in Mongolian addresses
const QUERIES = [
  'орон сууц',    // apartment building
  'хороолол',     // residential complex / district
  'байр',         // building / block
  'хотхон',       // residential compound
];

const SEARCH_RADIUS = 2500; // metres
const DELAY_MS      = 250;  // between requests
const PAGE_DELAY_MS = 2200; // required before next_page_token is valid

// Google Places result types that indicate a real estate agency / broker —
// these are NOT the physical buildings we want, so we skip them.
const SKIP_TYPES = new Set([
  'real_estate_agency',
  'insurance_agency',
  'finance',
  'lawyer',
  'accounting',
]);

// ─── Env ─────────────────────────────────────────────────────────────────────

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
    apiKey:         process.env.GOOGLE_PLACES_API_KEY   ?? env['GOOGLE_PLACES_API_KEY'],
    supabaseUrl:    process.env.EXPO_PUBLIC_SUPABASE_URL ?? env['EXPO_PUBLIC_SUPABASE_URL'],
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? env['SUPABASE_SERVICE_ROLE_KEY'],
  };
}

const ENV = loadEnv();

// ─── Google Places Text Search ────────────────────────────────────────────────

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function textSearch(query, lat, lng, apiKey) {
  const results = [];
  let url =
    `https://maps.googleapis.com/maps/api/place/textsearch/json` +
    `?query=${encodeURIComponent(query)}` +
    `&location=${lat},${lng}` +
    `&radius=${SEARCH_RADIUS}` +
    `&language=mn` +
    `&key=${apiKey}`;

  for (let page = 0; page < 3; page++) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (data.status === 'REQUEST_DENIED') {
      throw new Error(`API key error: ${data.error_message}`);
    }
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.warn(`    ⚠ status: ${data.status}`);
      break;
    }

    results.push(...(data.results ?? []));
    if (!data.next_page_token) break;

    await sleep(PAGE_DELAY_MS);
    url =
      `https://maps.googleapis.com/maps/api/place/textsearch/json` +
      `?pagetoken=${encodeURIComponent(data.next_page_token)}` +
      `&key=${apiKey}`;
  }
  return results;
}

// ─── Transform ───────────────────────────────────────────────────────────────

function isResidential(result) {
  const types = result.types ?? [];
  // Skip if any type indicates it's a business, not a building
  if (types.some(t => SKIP_TYPES.has(t))) return false;
  return true;
}

function toPlaceRow(result) {
  const lat = result.geometry?.location?.lat;
  const lng = result.geometry?.location?.lng;
  if (lat == null || lng == null) return null;
  if (!result.name) return null;
  if (!isResidential(result)) return null;

  return {
    place_id:              result.place_id,
    name:                  result.name,
    primary_category:      'apartments',
    types:                 result.types ?? [],
    location:              `SRID=4326;POINT(${lng} ${lat})`,
    lat,
    lng,
    formatted_address:     result.formatted_address ?? null,
    short_address:         null,
    phone_intl:            null,
    phone_national:        null,
    regular_opening_hours: null,
    current_opening_hours: null,
    rating:                result.rating ?? null,
    user_rating_count:     result.user_ratings_total ?? null,
    website_uri:           null,
    business_status:       result.business_status ?? null,
    raw:                   result,
  };
}

// ─── Supabase upload ──────────────────────────────────────────────────────────

async function upsertPlaces(rows, supabaseUrl, serviceKey) {
  const BATCH_SIZE = 100;
  let uploaded = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const res = await fetch(
      `${supabaseUrl}/rest/v1/places?on_conflict=place_id`,
      {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'apikey':        serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
          'Prefer':        'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(batch),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Supabase error (${res.status}) on batch ${i}: ${text}`);
    }
    uploaded += batch.length;
    process.stdout.write(`\r  ✓ ${uploaded}/${rows.length}`);
  }
  console.log();
  return uploaded;
}

// ─── Main ────────────────────────────────────────────────────────────────────

const rawPath = path.join(DATA_DIR, 'raw_apartments.json');
const outPath = path.join(DATA_DIR, 'apartments.json');

console.log('\n🏢 MonMap — Apartment Scraper (Google Text Search)');
console.log('═══════════════════════════════════════════════════');
console.log(`Grid points : ${GRID_POINTS.length}`);
console.log(`Queries     : ${QUERIES.join(', ')}`);
console.log(`Max calls   : ${GRID_POINTS.length * QUERIES.length * 3} (${GRID_POINTS.length} × ${QUERIES.length} queries × 3 pages)`);

let allRaw;

if (USE_CACHED) {
  if (!fs.existsSync(rawPath)) {
    console.error(`\n❌ --use-cached set but ${rawPath} not found.`);
    process.exit(1);
  }
  console.log(`\n📦 Loading cached results from data/raw_apartments.json…`);
  allRaw = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
} else {
  if (!ENV.apiKey) {
    console.error('\n❌ GOOGLE_PLACES_API_KEY not found. Add it to .env or .env.local.');
    process.exit(1);
  }

  console.log('\n🔎 Searching Google Places…\n');
  const byId = new Map();
  let searchNum = 0;
  const total = GRID_POINTS.length * QUERIES.length;

  for (const [lat, lng] of GRID_POINTS) {
    for (const query of QUERIES) {
      searchNum++;
      process.stdout.write(`[${searchNum}/${total}] "${query}" @ (${lat}, ${lng})… `);
      try {
        const results = await textSearch(query, lat, lng, ENV.apiKey);
        let newCount = 0;
        for (const r of results) {
          if (!byId.has(r.place_id)) {
            byId.set(r.place_id, r);
            newCount++;
          }
        }
        console.log(`${results.length} results, ${newCount} new (total: ${byId.size})`);
      } catch (err) {
        console.error(`ERROR: ${err.message}`);
      }
      await sleep(DELAY_MS);
    }
  }

  allRaw = [...byId.values()];
  fs.writeFileSync(rawPath, JSON.stringify(allRaw, null, 2));
  console.log(`\n  ✓ ${allRaw.length} unique raw results → data/raw_apartments.json`);
}

console.log('\n🔧 Transforming…');
const places = allRaw.map(toPlaceRow).filter(Boolean);

// Final dedup by place_id (shouldn't be needed but be safe)
const byId = new Map();
for (const p of places) byId.set(p.place_id, p);
const unique = [...byId.values()];

fs.writeFileSync(outPath, JSON.stringify(unique, null, 2));
console.log(`  ✓ ${unique.length} residential records (${allRaw.length - unique.length} filtered/duplicates) → data/apartments.json`);

if (DRY_RUN) {
  console.log('\n✅ Dry run complete — no upload.');
  process.exit(0);
}

if (!ENV.supabaseUrl || !ENV.serviceRoleKey) {
  console.error('\n❌ Missing Supabase credentials. Add to .env or .env.local:');
  console.error('   EXPO_PUBLIC_SUPABASE_URL=...');
  console.error('   SUPABASE_SERVICE_ROLE_KEY=...');
  process.exit(1);
}

console.log(`\n📤 Upserting ${unique.length} apartments to Supabase…`);
const count = await upsertPlaces(unique, ENV.supabaseUrl, ENV.serviceRoleKey);
console.log(`\n✅ Done. ${count} apartment places upserted into public.places.`);
