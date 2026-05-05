/**
 * Google Places API scraper for Ulaanbaatar businesses.
 *
 * Usage:
 *   node scripts/scrape-places.mjs
 *   node scripts/scrape-places.mjs --dry-run        (cost estimate only, no API calls)
 *   node scripts/scrape-places.mjs --category cafe  (single category test)
 *
 * Requires:
 *   GOOGLE_PLACES_API_KEY in .env.local
 *
 * Output:
 *   data/businesses.json   — transformed records ready for Supabase
 *   data/raw_places.json   — raw Google API responses (for debugging)
 *   data/progress.json     — resumable scrape state
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ─── Config ──────────────────────────────────────────────────────────────────

const API_KEY = loadApiKey();
const DRY_RUN = process.argv.includes('--dry-run');
const SINGLE_CATEGORY = (() => {
  const i = process.argv.indexOf('--category');
  return i !== -1 ? process.argv[i + 1] : null;
})();

// UB urban area bounding box: 4×3 grid, 2500m radius per point
// Covers the city from Bayanzurkh in the east to Songinokhairkhan in the west
const GRID_POINTS = [
  // North strip
  [47.922, 106.855], [47.922, 106.920], [47.922, 106.985],
  // Upper-center
  [47.900, 106.845], [47.900, 106.915], [47.900, 106.985],
  // Lower-center
  [47.875, 106.845], [47.875, 106.915], [47.875, 106.985],
  // South strip
  [47.850, 106.855], [47.850, 106.920], [47.850, 106.985],
];

// Google Places type → our schema category.
// Key = Google's type= parameter value; must be a supported nearbysearch type.
const CATEGORIES = {
  restaurant:               { name: 'Restaurant',       name_mn: 'Зоогийн газар',       icon: 'restaurant',  category_key: 'restaurant' },
  cafe:                     { name: 'Cafe',              name_mn: 'Кафе',                 icon: 'cafe',        category_key: 'cafe' },
  bar:                      { name: 'Bar',               name_mn: 'Бар',                  icon: 'bar',         category_key: 'bar' },
  bakery:                   { name: 'Bakery',            name_mn: 'Нарийн боовны газар',  icon: 'bakery',      category_key: 'bakery' },
  grocery_or_supermarket:   { name: 'Grocery',           name_mn: 'Хүнсний дэлгүүр',     icon: 'grocery',     category_key: 'grocery_or_supermarket' },
  convenience_store:        { name: 'Convenience Store', name_mn: 'Жижиг дэлгүүр',       icon: 'store',       category_key: 'convenience_store' },
  shopping_mall:            { name: 'Shopping Mall',     name_mn: 'Худалдааны төв',       icon: 'mall',        category_key: 'shopping_mall' },
  clothing_store:           { name: 'Clothing',          name_mn: 'Хувцасны дэлгүүр',    icon: 'clothing',    category_key: 'clothing_store' },
  beauty_salon:             { name: 'Beauty Salon',      name_mn: 'Гоо сайхны салон',     icon: 'salon',       category_key: 'beauty_salon' },
  hair_care:                { name: 'Hair Salon',        name_mn: 'Үсний салон',          icon: 'hair',        category_key: 'hair_care' },
  spa:                      { name: 'Spa',               name_mn: 'Спа',                  icon: 'spa',         category_key: 'spa' },
  gym:                      { name: 'Gym',               name_mn: 'Фитнесс клуб',        icon: 'gym',         category_key: 'gym' },
  pharmacy:                 { name: 'Pharmacy',          name_mn: 'Эмийн сан',           icon: 'pharmacy',    category_key: 'pharmacy' },
  hospital:                 { name: 'Hospital',          name_mn: 'Эмнэлэг',             icon: 'hospital',    category_key: 'hospital' },
  doctor:                   { name: 'Clinic',            name_mn: 'Эмнэлгийн клиник',    icon: 'clinic',      category_key: 'doctor' },
  dentist:                  { name: 'Dentist',           name_mn: 'Шүдний эмч',           icon: 'dentist',     category_key: 'dentist' },
  bank:                     { name: 'Bank',              name_mn: 'Банк',                 icon: 'bank',        category_key: 'bank' },
  car_repair:               { name: 'Car Repair',        name_mn: 'Авто засвар',          icon: 'car_repair',  category_key: 'car_repair' },
  gas_station:              { name: 'Gas Station',       name_mn: 'Шатахуун',             icon: 'fuel',        category_key: 'gas_station' },
  // Going-out & lodging — Google supports these as nearbysearch type= values
  lodging:                  { name: 'Hotel',             name_mn: 'Зочид буудал',         icon: 'hotel',       category_key: 'hotel' },
  night_club:               { name: 'Nightclub',         name_mn: 'Шөнийн клуб',          icon: 'nightclub',   category_key: 'nightclub' },
};

const SEARCH_RADIUS = 2500; // metres
const DETAIL_FIELDS = 'place_id,name,formatted_address,international_phone_number,geometry,opening_hours,types,business_status';
const DELAY_SEARCH_MS = 200;   // between search requests
const DELAY_DETAIL_MS = 120;   // between detail requests
const DELAY_PAGE_MS   = 2200;  // required before using next_page_token

// ─── Helpers ─────────────────────────────────────────────────────────────────

function loadApiKey() {
  if (process.env.GOOGLE_PLACES_API_KEY) return process.env.GOOGLE_PLACES_API_KEY;
  for (const name of ['.env', '.env.local']) {
    const p = path.join(ROOT, name);
    if (fs.existsSync(p)) {
      const line = fs.readFileSync(p, 'utf8').split('\n').find(l => l.startsWith('GOOGLE_PLACES_API_KEY='));
      if (line) return line.split('=')[1].trim();
    }
  }
  return null;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

function loadProgress() {
  const p = path.join(ROOT, 'data', 'progress.json');
  if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  return { fetchedPlaceIds: [], searchesDone: [] };
}

function saveProgress(progress) {
  fs.writeFileSync(
    path.join(ROOT, 'data', 'progress.json'),
    JSON.stringify(progress, null, 2),
  );
}

function loadRaw() {
  const p = path.join(ROOT, 'data', 'raw_places.json');
  if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  return {};
}

function saveRaw(raw) {
  fs.writeFileSync(path.join(ROOT, 'data', 'raw_places.json'), JSON.stringify(raw, null, 2));
}

// ─── Google API calls ─────────────────────────────────────────────────────────

async function nearbySearch(lat, lng, type) {
  const results = [];
  let url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json`
    + `?location=${lat},${lng}&radius=${SEARCH_RADIUS}&type=${type}&language=mn&key=${API_KEY}`;

  for (let page = 0; page < 3; page++) {
    const data = await fetchJson(url);
    if (data.status === 'REQUEST_DENIED') throw new Error(`API key error: ${data.error_message}`);
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.warn(`  ⚠ nearbySearch status: ${data.status}`);
      break;
    }
    results.push(...(data.results ?? []));
    if (!data.next_page_token) break;
    await sleep(DELAY_PAGE_MS); // required delay before next_page_token is valid
    url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json`
      + `?pagetoken=${data.next_page_token}&key=${API_KEY}`;
  }
  return results;
}

async function getPlaceDetails(placeId) {
  const url = `https://maps.googleapis.com/maps/api/place/details/json`
    + `?place_id=${placeId}&fields=${DETAIL_FIELDS}&language=mn&key=${API_KEY}`;
  const data = await fetchJson(url);
  if (data.status !== 'OK') return null;
  return data.result;
}

// ─── Transforms ──────────────────────────────────────────────────────────────

// Google day: 0=Sun, 1=Mon … 6=Sat
// Our schema: 0=Mon … 6=Sun
function googleDayToOurs(googleDay) {
  return googleDay === 0 ? 6 : googleDay - 1;
}

function transformHours(openingHours) {
  if (!openingHours?.periods) return [];
  return openingHours.periods.map(period => ({
    day_of_week: googleDayToOurs(period.open.day),
    open_time:   `${period.open.time.slice(0,2)}:${period.open.time.slice(2)}`,
    close_time:  period.close ? `${period.close.time.slice(0,2)}:${period.close.time.slice(2)}` : null,
    is_closed:   false,
  }));
}

function detectCategory(googleTypes) {
  for (const type of Object.keys(CATEGORIES)) {
    if (googleTypes.includes(type)) return CATEGORIES[type];
  }
  return null;
}

function transformPlace(detail) {
  const category = detectCategory(detail.types ?? []);

  return {
    external_id:   detail.place_id,
    name:          detail.name,
    name_mn:       detail.name, // same — Google returns Mongolian when language=mn
    address:       detail.formatted_address ?? null,
    phone:         detail.international_phone_number ?? null,
    latitude:      detail.geometry?.location?.lat ?? null,
    longitude:     detail.geometry?.location?.lng ?? null,
    hours:         transformHours(detail.opening_hours),
    google_types:  detail.types ?? [],
    category_name:    category?.name ?? 'Other',
    category_name_mn: category?.name_mn ?? 'Бусад',
    category_icon:    category?.icon ?? 'store',
    primary_category: category?.category_key ?? null,
    source:        'google_places',
    is_active:     detail.business_status === 'OPERATIONAL',
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const categories = SINGLE_CATEGORY
  ? { [SINGLE_CATEGORY]: CATEGORIES[SINGLE_CATEGORY] ?? { name: SINGLE_CATEGORY, name_mn: SINGLE_CATEGORY, icon: 'store' } }
  : CATEGORIES;

const totalSearches = GRID_POINTS.length * Object.keys(categories).length;
const estSearchCost = (totalSearches * 3 * 0.032).toFixed(2); // up to 3 pages each
const estDetailCost = (5000 * 0.017).toFixed(2);              // rough unique place estimate

console.log('\n📍 MonMap — Google Places Scraper');
console.log('═══════════════════════════════════');
console.log(`Grid points  : ${GRID_POINTS.length}`);
console.log(`Categories   : ${Object.keys(categories).join(', ')}`);
console.log(`Max searches : ${totalSearches} queries × up to 3 pages`);
console.log(`Est. cost    : ~$${estSearchCost} (search) + ~$${estDetailCost} (details) = ~$${(+estSearchCost + +estDetailCost).toFixed(2)}`);
console.log(`Output       : data/businesses.json`);

if (DRY_RUN) {
  console.log('\n✅ Dry run complete — no API calls made.');
  process.exit(0);
}

if (!API_KEY) {
  console.error('\n❌ GOOGLE_PLACES_API_KEY not found. Add it to .env.local:\n   GOOGLE_PLACES_API_KEY=your-key-here\n');
  process.exit(1);
}

console.log('\nStarting scrape… (Ctrl+C to pause — progress is saved)\n');

const progress = loadProgress();
const rawPlaces = loadRaw();

// ── Phase 1: Nearby Search ────────────────────────────────────────────────────
let searchCount = 0;
const discoveredIds = new Set(progress.fetchedPlaceIds);

for (const [lat, lng] of GRID_POINTS) {
  for (const type of Object.keys(categories)) {
    const searchKey = `${lat},${lng}:${type}`;
    if (progress.searchesDone.includes(searchKey)) {
      searchCount++;
      continue;
    }

    process.stdout.write(`[${++searchCount}/${totalSearches}] Searching ${type} @ (${lat}, ${lng})… `);
    try {
      const results = await nearbySearch(lat, lng, type);
      let newCount = 0;
      for (const r of results) {
        if (!discoveredIds.has(r.place_id)) {
          discoveredIds.add(r.place_id);
          newCount++;
        }
      }
      console.log(`${results.length} results, ${newCount} new (total: ${discoveredIds.size})`);
      progress.searchesDone.push(searchKey);
      saveProgress(progress);
    } catch (err) {
      console.error(`ERROR: ${err.message}`);
    }
    await sleep(DELAY_SEARCH_MS);
  }
}

// ── Phase 2: Place Details ────────────────────────────────────────────────────
const allIds = [...discoveredIds];
const toFetch = allIds.filter(id => !rawPlaces[id]);

console.log(`\n📋 ${allIds.size} unique places found. Fetching details for ${toFetch.length} (${allIds.length - toFetch.length} cached)…\n`);

let detailCount = 0;
for (const placeId of toFetch) {
  process.stdout.write(`[${++detailCount}/${toFetch.length}] ${placeId}… `);
  try {
    const detail = await getPlaceDetails(placeId);
    if (detail) {
      rawPlaces[placeId] = detail;
      console.log(detail.name);
    } else {
      console.log('(no data)');
    }
    // Save raw every 50 records
    if (detailCount % 50 === 0) saveRaw(rawPlaces);
    progress.fetchedPlaceIds = Object.keys(rawPlaces);
    if (detailCount % 100 === 0) saveProgress(progress);
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
  }
  await sleep(DELAY_DETAIL_MS);
}

saveRaw(rawPlaces);
saveProgress({ ...progress, fetchedPlaceIds: Object.keys(rawPlaces) });

// ── Phase 3: Transform & save ─────────────────────────────────────────────────
const businesses = Object.values(rawPlaces)
  .filter(d => d.geometry?.location)           // must have coordinates
  .filter(d => d.business_status !== 'CLOSED_PERMANENTLY')
  .map(transformPlace);

fs.writeFileSync(
  path.join(ROOT, 'data', 'businesses.json'),
  JSON.stringify(businesses, null, 2),
);

console.log(`\n✅ Done!`);
console.log(`   ${businesses.length} businesses saved to data/businesses.json`);
console.log(`   Run: node scripts/upload-to-supabase.mjs`);
