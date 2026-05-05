# Setting Up Supabase Schema

Your app needs two separate systems:

## 1. Places Table (for OSM/Google Places data)
You need to create a `places` table with the schema defined in `supabase/migrations/20260505000000_places_table.sql`.

### Option A: Via Supabase Dashboard
1. Go to your Supabase project: https://app.supabase.com/project/brykoxmygtiyrssmsvys
2. Click "SQL Editor" → "New Query"
3. Copy the entire contents of `supabase/migrations/20260505000000_places_table.sql`
4. Click "Run"

### Option B: Via Supabase CLI
```bash
npm install -g supabase
supabase link --project-ref brykoxmygtiyrssmsvys
supabase migration up
```

### Option C: Via psql (if you have DB access)
```bash
psql postgresql://postgres:[password]@db.brykoxmygtiyrssmsvys.supabase.co:5432/postgres \
  -f supabase/migrations/20260501000000_initial_schema.sql \
  -f supabase/migrations/20260503000001_portal_policies.sql \
  -f supabase/migrations/20260503000002_portal_places_owner_policies.sql \
  -f supabase/migrations/20260505000000_places_table.sql \
  -f supabase/migrations/20260505000001_booking_notifications.sql \
  -f supabase/migrations/20260506000001_place_slot_capacity.sql \
  -f supabase/migrations/20260506000002_place_booking_hours.sql \
  -f supabase/migrations/20260507000001_place_closure_reports.sql
```

## 2. Upload Data
Once the schema is created, run:
```bash
node scripts/upload-to-supabase.mjs
```

This uploads categories and businesses data to your database.

