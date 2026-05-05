-- Track when a place's hours were last crowd-verified (open confirmation or closure report).
-- Defaults to now() so existing places start fresh; badge degrades after STALE_DAYS on the client.

alter table places
  add column if not exists hours_verified_at timestamptz not null default now();

-- Crowd "this place is currently open" confirmations.
create table place_open_confirmations (
  id         bigserial   primary key,
  place_id   text        not null,
  created_at timestamptz not null default now()
);

create index place_open_confirmations_place_idx
  on place_open_confirmations(place_id);

-- Shared trigger function: any crowd signal (open OR closed) refreshes the timestamp.
create or replace function touch_hours_verified_at()
returns trigger
security definer
language plpgsql as $$
begin
  update places
  set hours_verified_at = now()
  where place_id = new.place_id;
  return new;
end;
$$;

create trigger place_open_confirmations_after_insert
  after insert on place_open_confirmations
  for each row execute function touch_hours_verified_at();

-- Closure reports are also a crowd signal — they confirm the place exists and was visited.
create trigger place_closure_reports_touch_verified
  after insert on place_closure_reports
  for each row execute function touch_hours_verified_at();

alter table place_open_confirmations enable row level security;

create policy "open_confirmations: anyone can confirm"
  on place_open_confirmations for insert
  with check (true);
