/**
 * Re-uploads OSM apartment records from the cached data/osm_places.json.
 * Use this after cleanup-osm-overlap.mjs removed apartments from Supabase —
 * OSM IDs (osm:*) never conflict with Google IDs (ChIJ*) so both coexist safely.
 *
 * Usage:
 *   node scripts/reupload-osm-apartments.mjs
 *   node scripts/reupload-osm-apartments.mjs --dry-run
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DRY_RUN = process.argv.includes('--dry-run');

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
    supabaseUrl:    process.env.EXPO_PUBLIC_SUPABASE_URL   ?? env['EXPO_PUBLIC_SUPABASE_URL'],
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY  ?? env['SUPABASE_SERVICE_ROLE_KEY'],
  };
}

const cachedPath = path.join(ROOT, 'data', 'osm_places.json');
if (!fs.existsSync(cachedPath)) {
  console.error('❌ data/osm_places.json not found. Run scrape-osm.mjs --query-only first.');
  process.exit(1);
}

const all = JSON.parse(fs.readFileSync(cachedPath, 'utf8'));
const apartments = all.filter(p => p.primary_category === 'apartments');

console.log('\n🏢 Re-uploading OSM apartments');
console.log('═══════════════════════════════════');
console.log(`Cached records : ${all.length} total, ${apartments.length} apartments`);

if (DRY_RUN) {
  console.log('\n✅ Dry run — no upload.');
  process.exit(0);
}

const { supabaseUrl, serviceRoleKey } = loadEnv();
if (!supabaseUrl || !serviceRoleKey) {
  console.error('\n❌ Missing Supabase credentials.');
  process.exit(1);
}

const BATCH_SIZE = 100;
let uploaded = 0;
for (let i = 0; i < apartments.length; i += BATCH_SIZE) {
  const batch = apartments.slice(i, i + BATCH_SIZE);
  const res = await fetch(
    `${supabaseUrl}/rest/v1/places?on_conflict=place_id`,
    {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'apikey':        serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Prefer':        'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(batch),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase error (${res.status}): ${text}`);
  }
  uploaded += batch.length;
  process.stdout.write(`\r  ✓ ${uploaded}/${apartments.length}`);
}
console.log();
console.log(`\n✅ Done. ${uploaded} OSM apartments upserted into public.places.`);
