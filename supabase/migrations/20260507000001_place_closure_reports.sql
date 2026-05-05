-- Track user reports of places that appear permanently closed.
-- Places with >= 10 reports are hidden from the map; places with > 1 are deprioritised.

alter table places
  add column if not exists closure_report_count integer not null default 0;

create index if not exists places_closure_report_count_idx
  on places(closure_report_count) where closure_report_count > 0;

create table place_closure_reports (
  id         bigserial   primary key,
  place_id   text        not null,
  created_at timestamptz not null default now()
);

create index place_closure_reports_place_idx
  on place_closure_reports(place_id);

-- Increment the denormalized counter so usePlaces can filter efficiently.
-- SECURITY DEFINER so the anon role (which only has INSERT on this table)
-- can still trigger an UPDATE on places.
create or replace function increment_closure_report_count()
returns trigger
security definer
language plpgsql as $$
begin
  update places
  set closure_report_count = closure_report_count + 1
  where place_id = new.place_id;
  return new;
end;
$$;

create trigger place_closure_reports_after_insert
  after insert on place_closure_reports
  for each row execute function increment_closure_report_count();

alter table place_closure_reports enable row level security;

create policy "closure_reports: anyone can report"
  on place_closure_reports for insert
  with check (true);
