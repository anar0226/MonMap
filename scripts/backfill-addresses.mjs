/**
 * Parses every place's free-text address into the structured Mongolian columns
 * (district / khoroo / khoroolol / building_number / entrance_number /
 * unit_number / address_searchable) added in migration
 * 20260506000003_place_mn_address.sql.
 *
 * Usage:
 *   node scripts/backfill-addresses.mjs                 (apply updates)
 *   node scripts/backfill-addresses.mjs --dry-run       (parse + report stats only)
 *
 * Requires in .env / .env.local:
 *   EXPO_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Idempotent: safe to re-run after parser tweaks.
 *
 * NOTE: The parser logic below mirrors src/lib/mnAddress.ts. Keep the regexes
 * and DISTRICT tables in sync — the .ts file is the canonical version, this
 * file exists because we don't ship a TS-script runner in devDependencies.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DRY_RUN = process.argv.includes('--dry-run');

// ─── Env ──────────────────────────────────────────────────────────────────────

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

if (!DRY_RUN && (!SUPABASE_URL || !SERVICE_KEY)) {
  console.error('\n❌ Missing Supabase credentials in .env:\n   EXPO_PUBLIC_SUPABASE_URL=...\n   SUPABASE_SERVICE_ROLE_KEY=...\n');
  process.exit(1);
}

// ─── Parser (mirror of src/lib/mnAddress.ts + searchNormalize.ts) ────────────

const CYR_TO_LAT = [
  [/щ/g, 'shch'], [/ш/g, 'sh'], [/ч/g, 'ch'], [/ц/g, 'ts'],
  [/ю/g, 'yu'],   [/я/g, 'ya'], [/ё/g, 'yo'],
  [/а/g, 'a'], [/б/g, 'b'], [/в/g, 'v'], [/г/g, 'g'], [/д/g, 'd'],
  [/е/g, 'e'], [/ж/g, 'j'], [/з/g, 'z'], [/и/g, 'i'], [/й/g, 'y'],
  [/к/g, 'k'], [/л/g, 'l'], [/м/g, 'm'], [/н/g, 'n'], [/о/g, 'o'],
  [/ө/g, 'o'], [/п/g, 'p'], [/р/g, 'r'], [/с/g, 's'], [/т/g, 't'],
  [/у/g, 'u'], [/ү/g, 'u'], [/ф/g, 'f'], [/х/g, 'h'], [/ъ/g, ''],
  [/ы/g, 'i'], [/ь/g, ''],  [/э/g, 'e'],
];

function normalizeForSearch(s) {
  let r = s.toLowerCase();
  for (const [from, to] of CYR_TO_LAT) r = r.replace(from, to);
  r = r.replace(/kh/g, 'h');
  return r.replace(/[^a-z0-9]+/g, ' ').trim();
}

const DISTRICT_NAMES = [
  'Сүхбаатар', 'Чингэлтэй', 'Баянзүрх', 'Хан-Уул', 'Сонгинохайрхан',
  'Баянгол', 'Налайх', 'Багануур', 'Багахангай',
];
const DISTRICT_ABBR = {
  'сбд': 'Сүхбаатар', 'чд': 'Чингэлтэй', 'бзд': 'Баянзүрх', 'худ': 'Хан-Уул',
  'схд': 'Сонгинохайрхан', 'бгд': 'Баянгол', 'нд': 'Налайх',
  'бнд': 'Багануур', 'бхд': 'Багахангай',
};
const DISTRICT_LOWER = Object.fromEntries(DISTRICT_NAMES.map(n => [n.toLowerCase(), n]));

const RE_KHOROO       = /(\d{1,3})\s*-?\s*[рp]?\s*хороо(?!лол)/;
const RE_KHOROOLOL_N  = /(\d{1,3})\s*-?\s*[рp]?\s*хороолол/;
const RE_KHOROOLOL_S  = /([а-яөү][а-яөү\-]+)\s+(хороолол|хотхон)/;
const RE_BUILDING     = /(\d{1,4}[а-яөү]?)\s*-?\s*[рp]?\s*байр/;
const RE_ENTRANCE     = /(\d{1,2})\s*-?\s*[рp]?\s*хаалга/;
const RE_UNIT         = /(\d{1,4}[а-яөү]?)\s*тоот/;
const RE_DISTRICT_ABBR = /(?:^|[^а-яөү])(сбд|чд|бзд|худ|схд|бгд|нд|бнд|бхд)(?![а-яөү])/;

function capitalizeWords(s) {
  return s.replace(/(^|[\s\-])([а-яөү])/g, (_, sep, c) => sep + c.toUpperCase());
}

function parseMnAddress(text) {
  if (!text) return {};
  const lower = text.toLowerCase();
  const out = {};

  for (const lc of Object.keys(DISTRICT_LOWER).sort((a, b) => b.length - a.length)) {
    if (lower.includes(lc)) { out.district = DISTRICT_LOWER[lc]; break; }
  }
  if (!out.district) {
    const m = lower.match(RE_DISTRICT_ABBR);
    if (m) out.district = DISTRICT_ABBR[m[1]];
  }

  const mKhoroo = lower.match(RE_KHOROO);
  if (mKhoroo) {
    const n = parseInt(mKhoroo[1], 10);
    if (n > 0 && n < 1000) out.khoroo = n;
  }

  const mKhN = lower.match(RE_KHOROOLOL_N);
  if (mKhN) {
    out.khoroolol = `${parseInt(mKhN[1], 10)}-р хороолол`;
  } else {
    const mKhS = lower.match(RE_KHOROOLOL_S);
    if (mKhS) out.khoroolol = `${capitalizeWords(mKhS[1])} ${mKhS[2]}`;
  }

  const mBldg = lower.match(RE_BUILDING);
  if (mBldg) out.buildingNumber = mBldg[1].toUpperCase();

  const mEntr = lower.match(RE_ENTRANCE);
  if (mEntr) {
    const n = parseInt(mEntr[1], 10);
    if (n > 0 && n < 100) out.entranceNumber = n;
  }

  const mUnit = lower.match(RE_UNIT);
  if (mUnit) out.unitNumber = mUnit[1].toUpperCase();

  return out;
}

function normalizeAddressForSearch(p, original) {
  const tokens = [];
  if (p.district) tokens.push(p.district);
  if (p.khoroo) tokens.push(`${p.khoroo}-р хороо`);
  if (p.khoroolol) tokens.push(p.khoroolol);
  if (p.buildingNumber) tokens.push(`${p.buildingNumber}-р байр`, `${p.buildingNumber} байр`);
  if (p.entranceNumber) tokens.push(`${p.entranceNumber}-р хаалга`);
  if (p.unitNumber) tokens.push(`${p.unitNumber} тоот`);
  if (original) tokens.push(original);
  return normalizeForSearch(tokens.join(' '));
}

// ─── Supabase REST helpers ────────────────────────────────────────────────────

async function fetchPage(offset, limit) {
  const url = `${SUPABASE_URL}/rest/v1/places?select=place_id,name,formatted_address,short_address&order=place_id.asc&limit=${limit}&offset=${offset}`;
  const res = await fetch(url, {
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`fetch ${offset}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function patchRow(placeId, fields) {
  const url = `${SUPABASE_URL}/rest/v1/places?place_id=eq.${encodeURIComponent(placeId)}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(fields),
  });
  if (!res.ok) throw new Error(`patch ${placeId}: ${res.status} ${await res.text()}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log('\n🏷️  MonMap — Mongolian address backfill');
console.log('═══════════════════════════════════════════');
console.log(`Mode              : ${DRY_RUN ? 'dry-run (no writes)' : 'live update'}`);
console.log(`Supabase URL      : ${SUPABASE_URL ?? '(missing)'}`);

const PAGE = 1000;
let offset = 0;
let total = 0;
let parsedAny = 0;
let parsedFull = 0;     // had khoroolol or building
const districtHits = {};
const unparseable = [];

while (true) {
  const rows = DRY_RUN && !SUPABASE_URL
    ? []
    : await fetchPage(offset, PAGE);
  if (!rows.length) break;

  for (const row of rows) {
    total++;
    const source = row.formatted_address || row.short_address || row.name || '';
    const parts = parseMnAddress(source);
    const haveAny = Object.keys(parts).length > 0;
    const haveStrong = !!(parts.khoroolol || parts.buildingNumber);

    if (haveAny) parsedAny++;
    if (haveStrong) parsedFull++;
    if (parts.district) districtHits[parts.district] = (districtHits[parts.district] ?? 0) + 1;

    if (!haveAny && unparseable.length < 50) {
      unparseable.push({ place_id: row.place_id, name: row.name, formatted_address: row.formatted_address });
    }

    if (!DRY_RUN && haveAny) {
      const update = {
        district:           parts.district ?? null,
        khoroo:             parts.khoroo ?? null,
        khoroolol:          parts.khoroolol ?? null,
        building_number:    parts.buildingNumber ?? null,
        entrance_number:    parts.entranceNumber ?? null,
        unit_number:        parts.unitNumber ?? null,
        address_searchable: normalizeAddressForSearch(parts, source),
      };
      try {
        await patchRow(row.place_id, update);
      } catch (e) {
        console.error(`  ✗ ${row.place_id}: ${e.message}`);
      }
    }
  }

  offset += PAGE;
  process.stdout.write(`\r  processed ${total}…`);
  if (rows.length < PAGE) break;
}

console.log();
console.log('\n📊 Results');
console.log('───────────────────────────────────────────');
console.log(`Total rows           : ${total}`);
console.log(`Parsed any token     : ${parsedAny} (${((parsedAny/total)*100).toFixed(1)}%)`);
console.log(`Parsed хороолол/байр : ${parsedFull} (${((parsedFull/total)*100).toFixed(1)}%)`);
console.log('District hits:');
for (const [d, n] of Object.entries(districtHits).sort((a, b) => b[1] - a[1])) {
  console.log(`   ${d.padEnd(16)} ${n}`);
}

if (unparseable.length) {
  const out = path.join(DATA_DIR, 'unparseable_addresses.json');
  fs.writeFileSync(out, JSON.stringify(unparseable, null, 2));
  console.log(`\nSample unparseable rows (first ${unparseable.length}) → ${out}`);
}

console.log(DRY_RUN ? '\n✅ Dry run complete (no writes performed).' : '\n✅ Backfill complete.');
