/**
 * OpenStreetMap scraper for Ulaanbaatar civic POIs and apartment buildings.
 *
 * Pulls data Google Places does not index — apartment buildings, schools,
 * universities, kindergartens, libraries, parks, government offices,
 * police/fire stations, post offices.
 *
 * Usage:
 *   node scripts/scrape-osm.mjs                 (full run: query + upload)
 *   node scripts/scrape-osm.mjs --query-only    (fetch from Overpass, save to data/, no upload)
 *   node scripts/scrape-osm.mjs --dry-run       (transform only, validate, no upload)
 *   node scripts/scrape-osm.mjs --use-cached    (skip Overpass, use data/raw_osm.json)
 *
 * Requires in .env.local (only when uploading):
 *   EXPO_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Output:
 *   data/raw_osm.json     — raw Overpass response
 *   data/osm_places.json  — transformed place rows
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const QUERY_ONLY = process.argv.includes('--query-only');
const DRY_RUN    = process.argv.includes('--dry-run');
const USE_CACHED = process.argv.includes('--use-cached');

// ─── Config ──────────────────────────────────────────────────────────────────

// UB urban area bbox (south, west, north, east).
// Covers central UB plus surrounding districts (Bayanzurkh, Songinokhairkhan, etc.)
const BBOX = [47.78, 106.65, 48.05, 107.20];

// OSM tag → our category key. Keys must match src/constants/categories.ts.
// Only civic categories Google Places doesn't index well.
// hospital / clinic / pharmacy are intentionally excluded — Google covers those.
// apartments are excluded — Google Places handles residential buildings.
const AMENITY_CATEGORY = {
  school:        'school',
  university:    'university',
  college:       'university',
  kindergarten:  'kindergarten',
  library:       'library',
  police:        'police',
  post_office:   'post_office',
  fire_station:  'fire_station',
  townhall:      'government',
};

// ─── Overpass query ──────────────────────────────────────────────────────────

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
];

function buildOverpassQuery() {
  const [s, w, n, e] = BBOX;
  const bbox = `${s},${w},${n},${e}`;
  const amenityRegex = Object.keys(AMENITY_CATEGORY).join('|');
  return `
[out:json][timeout:120];
(
  // Civic amenities
  node["amenity"~"^(${amenityRegex})$"](${bbox});
  way["amenity"~"^(${amenityRegex})$"](${bbox});
  relation["amenity"~"^(${amenityRegex})$"](${bbox});

  // Government offices
  node["office"="government"](${bbox});
  way["office"="government"](${bbox});

  // Named parks
  node["leisure"="park"]["name"](${bbox});
  way["leisure"="park"]["name"](${bbox});
  relation["leisure"="park"]["name"](${bbox});
);
out center tags;
`.trim();
}

async function fetchOverpass(query) {
  let lastErr;
  for (const url of OVERPASS_ENDPOINTS) {
    try {
      console.log(`  Trying ${url}…`);
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'MonMap/1.0 (Ulaanbaatar map app; anar0226@gmail.com)',
        },
        body: `data=${encodeURIComponent(query)}`,
      });
      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status} from ${url}`);
        continue;
      }
      return await res.json();
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr ?? new Error('All Overpass endpoints failed');
}

// ─── Transform ───────────────────────────────────────────────────────────────

function osmCategory(tags) {
  const a = tags.amenity;
  if (a && AMENITY_CATEGORY[a]) return AMENITY_CATEGORY[a];
  if (tags.office === 'government') return 'government';
  if (tags.leisure === 'park') return 'park';
  return null;
}

function osmTypes(tags) {
  const t = [];
  if (tags.building) t.push(`building:${tags.building}`);
  if (tags.amenity)  t.push(`amenity:${tags.amenity}`);
  if (tags.office)   t.push(`office:${tags.office}`);
  if (tags.leisure)  t.push(`leisure:${tags.leisure}`);
  return t;
}

function osmAddress(tags) {
  const parts = [
    tags['addr:housenumber'],
    tags['addr:street'],
    tags['addr:district'] || tags['addr:suburb'],
    tags['addr:city'] || 'Улаанбаатар',
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

function elementToPlace(el) {
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (lat == null || lon == null) return null;

  const tags = el.tags ?? {};
  const name = tags['name:mn'] || tags.name || tags['name:en'];
  if (!name) return null;

  const category = osmCategory(tags);
  if (!category) return null;

  return {
    place_id:              `osm:${el.type}:${el.id}`,
    name,
    primary_category:      category,
    types:                 osmTypes(tags),
    location:              `SRID=4326;POINT(${lon} ${lat})`,
    lat,
    lng:                   lon,
    formatted_address:     osmAddress(tags),
    short_address:         tags['addr:street'] ?? null,
    phone_intl:            tags.phone ?? tags['contact:phone'] ?? null,
    phone_national:        null,
    regular_opening_hours: null,
    current_opening_hours: null,
    rating:                null,
    user_rating_count:     null,
    website_uri:           tags.website ?? tags['contact:website'] ?? null,
    business_status:       null,
    raw:                   el,
  };
}

// ─── Supabase upload ─────────────────────────────────────────────────────────

function loadEnv() {
  const env = {};
  for (const name of ['.env', '.env.local']) {
    const envPath = path.join(ROOT, name);
    if (fs.existsSync(envPath)) {
      for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
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

console.log('\n🗺️  MonMap — OSM Scraper');
console.log('═══════════════════════════════════');
console.log(`Bounding box : (${BBOX[0]}, ${BBOX[1]}) → (${BBOX[2]}, ${BBOX[3]})`);
console.log(`Categories   : ${[...new Set(Object.values(AMENITY_CATEGORY)), 'apartments', 'government', 'park'].join(', ')}`);

const rawPath  = path.join(DATA_DIR, 'raw_osm.json');
const outPath  = path.join(DATA_DIR, 'osm_places.json');

let raw;

if (USE_CACHED) {
  if (!fs.existsSync(rawPath)) {
    console.error(`\n❌ --use-cached set but ${rawPath} not found.`);
    process.exit(1);
  }
  console.log(`\n📦 Loading cached Overpass response from data/raw_osm.json…`);
  raw = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
} else {
  const query = buildOverpassQuery();
  console.log(`\n🔎 Querying Overpass…`);
  raw = await fetchOverpass(query);
  fs.writeFileSync(rawPath, JSON.stringify(raw, null, 2));
  console.log(`  ✓ ${raw.elements?.length ?? 0} elements → data/raw_osm.json`);
}

if (QUERY_ONLY) {
  console.log('\n✅ Query-only run complete.');
  process.exit(0);
}

console.log(`\n🔧 Transforming…`);
const places = (raw.elements ?? [])
  .map(elementToPlace)
  .filter(Boolean);

// Deduplicate by place_id (Overpass occasionally returns the same element via different queries)
const byId = new Map();
for (const p of places) byId.set(p.place_id, p);
const unique = [...byId.values()];

fs.writeFileSync(outPath, JSON.stringify(unique, null, 2));
console.log(`  ✓ ${unique.length} valid records (${places.length - unique.length} duplicates removed) → data/osm_places.json`);

const byCategory = unique.reduce((acc, p) => {
  acc[p.primary_category] = (acc[p.primary_category] ?? 0) + 1;
  return acc;
}, {});
console.log(`\nCategory counts:`);
for (const [cat, n] of Object.entries(byCategory).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${cat.padEnd(16)} ${n}`);
}

if (DRY_RUN) {
  console.log('\n✅ Dry run complete — no upload.');
  process.exit(0);
}

const { url: SUPABASE_URL, serviceRoleKey: SERVICE_KEY } = loadEnv();
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('\n❌ Missing Supabase credentials. Add to .env.local:');
  console.error('   EXPO_PUBLIC_SUPABASE_URL=...');
  console.error('   SUPABASE_SERVICE_ROLE_KEY=...');
  process.exit(1);
}

console.log(`\n📤 Upserting ${unique.length} places to Supabase…`);
const count = await upsertPlaces(unique, SUPABASE_URL, SERVICE_KEY);
console.log(`\n✅ Done. ${count} OSM places upserted into public.places.`);
