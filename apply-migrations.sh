#!/bin/bash

SUPABASE_URL="https://brykoxmygtiyrssmsvys.supabase.co"
SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJyeWtveG15Z3RpeXJzc21zdnlzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzYzMTY1MiwiZXhwIjoyMDkzMjA3NjUyfQ.nKVeVfI1S_CmdWJjnmdHxFExGu4qJ-Nka5V_61Bzap4"

echo "Applying migrations to Supabase..."

# Apply places table migration
echo "Creating places table..."
curl -s -X POST \
  "$SUPABASE_URL/rest/v1/rpc/sql" \
  -H "apikey: $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d @- << 'SQL'
{
  "query": "create table if not exists places (place_id text primary key, name text not null, primary_category text, lat numeric(10, 8) not null, lng numeric(11, 8) not null, formatted_address text, short_address text, phone_intl text, phone_national text, regular_opening_hours jsonb, current_opening_hours jsonb, rating numeric(3, 2), user_rating_count integer, website_uri text, business_status text, closure_report_count integer not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now()); create index if not exists places_category_idx on places(primary_category); create index if not exists places_name_idx on places(name); alter table places enable row level security; create policy if not exists \"places: public read\" on places for select using (true);"
}
SQL

echo "Done!"
