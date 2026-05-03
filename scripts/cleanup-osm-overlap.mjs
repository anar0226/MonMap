/**
 * Deletes OSM-sourced places for categories now owned by Google Places.
 * Run once after narrowing scrape-osm.mjs to civic-only categories.
 *
 * Usage:
 *   node scripts/cleanup-osm-overlap.mjs
 *   node scripts/cleanup-osm-overlap.mjs --dry-run
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DRY_RUN = process.argv.includes('--dry-run');

// Categories removed from OSM scraper — now owned by Google Places.
const REMOVED_CATEGORIES = ['apartments', 'pharmacy', 'hospital', 'doctor'];

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

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Missing Supabase credentials.');
  process.exit(1);
}

console.log('\n🧹 OSM Overlap Cleanup');
console.log('═══════════════════════════════════');
console.log(`Categories to remove : ${REMOVED_CATEGORIES.join(', ')}`);
console.log(`Filter               : place_id starts with osm:`);
if (DRY_RUN) console.log('Mode                 : DRY RUN');

for (const category of REMOVED_CATEGORIES) {
  // PostgREST filter: place_id starts with 'osm:' AND primary_category = category
  const filter = `place_id=like.osm%3A*&primary_category=eq.${category}`;

  if (DRY_RUN) {
    // COUNT first
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/places?${filter}&select=place_id`,
      {
        headers: {
          'apikey': SERVICE_KEY,
          'Authorization': `Bearer ${SERVICE_KEY}`,
          'Prefer': 'count=exact',
          'Range-Unit': 'items',
          'Range': '0-0',
        },
      },
    );
    const count = res.headers.get('content-range')?.split('/')[1] ?? '?';
    console.log(`  ${category.padEnd(14)} ${count} rows would be deleted`);
  } else {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/places?${filter}`,
      {
        method: 'DELETE',
        headers: {
          'apikey': SERVICE_KEY,
          'Authorization': `Bearer ${SERVICE_KEY}`,
          'Prefer': 'return=minimal',
        },
      },
    );
    if (!res.ok) {
      const text = await res.text();
      console.error(`  ✗ ${category}: ${res.status} ${text}`);
    } else {
      console.log(`  ✓ ${category} — deleted`);
    }
  }
}

console.log(DRY_RUN ? '\n✅ Dry run complete.' : '\n✅ Done.');
