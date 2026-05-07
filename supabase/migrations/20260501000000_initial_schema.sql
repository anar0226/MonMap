-- ============================================================
-- Extensions
-- ============================================================
create extension if not exists "uuid-ossp";
create extension if not exists "postgis";

-- ============================================================
-- Enums
-- ============================================================
create type price_source    as enum ('receipt', 'owner', 'manual');
create type receipt_status  as enum ('pending', 'processed', 'failed');
create type business_source as enum ('google_places', 'owner', 'manual');

-- ============================================================
-- Utility: auto-update updated_at
-- ============================================================
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ============================================================
-- Categories
-- ============================================================
create table categories (
  id        uuid primary key default uuid_generate_v4(),
  name      text not null unique,
  name_mn   text not null,
  icon      text,
  parent_id uuid references categories(id) on delete set null
);

-- ============================================================
-- Users  (mirrors auth.users — populated via trigger on signup)
-- ============================================================
create table users (
  id         uuid primary key references auth.users(id) on delete cascade,
  phone      text unique,
  email      text,
  full_name  text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, phone, email)
  values (new.id, new.phone, new.email);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================
-- Places  (reference data from OSM / Google Places)
-- ============================================================
-- The places table is the canonical business reference for the app. The
-- legacy `businesses` table below is unused but kept for now to avoid breaking
-- downstream tooling; do not use it for new development.
create table if not exists places (
  place_id               text primary key,
  name                   text not null,
  primary_category       text,
  lat                    numeric(10, 8) not null,
  lng                    numeric(11, 8) not null,
  formatted_address      text,
  short_address          text,
  phone_intl             text,
  phone_national         text,
  regular_opening_hours  jsonb,
  current_opening_hours  jsonb,
  rating                 numeric(3, 2),
  user_rating_count      integer,
  website_uri            text,
  business_status        text,
  closure_report_count   integer not null default 0,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists places_location_idx on places
  using gist(st_geogfromtext(format('POINT(%s %s)', lng, lat)));
create index if not exists places_category_idx on places(primary_category);
create index if not exists places_name_idx     on places(name);
create index if not exists places_rating_idx   on places(rating desc nulls last);
create index if not exists places_closure_idx  on places(closure_report_count) where closure_report_count > 0;

alter table places enable row level security;
drop policy if exists "places: public read"         on places;
drop policy if exists "places: service role write"  on places;
create policy "places: public read"        on places for select using (true);
create policy "places: service role write" on places
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- ============================================================
-- Business Owners  (links auth user → place)
-- ============================================================
-- Policies for this table are added in 20260503000001 (and tightened in
-- 20260510000001 with claim_status). Defined here so the FK from bookings
-- below resolves on a fresh `db reset`.
create table if not exists public.business_owners (
  user_id    uuid not null references auth.users(id) on delete cascade,
  place_id   text not null references public.places(place_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, place_id)
);

-- ============================================================
-- Businesses (LEGACY — unused by the app, kept for compatibility)
-- ============================================================
create table businesses (
  id              uuid primary key default uuid_generate_v4(),
  owner_id        uuid references users(id) on delete set null,
  name            text not null,
  name_mn         text,
  category_id     uuid references categories(id) on delete set null,
  description     text,
  address         text,
  district        text,
  khoroo          smallint,
  location        geography(Point, 4326),
  phone           text,
  instagram       text,
  website         text,
  cover_photo_url text,
  is_verified     boolean not null default false,
  is_active       boolean not null default true,
  source          business_source not null default 'manual',
  external_id     text unique,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger businesses_updated_at
  before update on businesses
  for each row execute function set_updated_at();

create table business_hours (
  id          uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  open_time   time,
  close_time  time,
  is_closed   boolean not null default false
);

create table services (
  id               uuid primary key default uuid_generate_v4(),
  business_id      uuid not null references businesses(id) on delete cascade,
  name             text not null,
  name_mn          text,
  duration_minutes smallint,
  price            numeric(10,2),
  max_capacity     smallint not null default 1,
  is_active        boolean not null default true
);

create table staff (
  id          uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  name        text not null,
  role        text,
  photo_url   text,
  is_active   boolean not null default true
);

create table staff_services (
  staff_id   uuid not null references staff(id) on delete cascade,
  service_id uuid not null references services(id) on delete cascade,
  primary key (staff_id, service_id)
);

-- ============================================================
-- Bookings
-- ============================================================
-- Shape matches the mobile app (src/hooks/useBooking.ts), portal
-- (monmap-portal/js/utils.js), and edge functions. user_id is nullable so
-- guest bookings (no account) can still be inserted; the portal owner read
-- path goes through business_owners rather than user_id.
create table bookings (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid references users(id) on delete set null,
  place_id     text not null references places(place_id) on delete cascade,
  booked_date  date  not null,
  time_slot    text  not null,
  party_size   smallint not null default 1,
  guest_name   text,
  guest_phone  text,
  status       text  not null default 'pending'
                 constraint bookings_status_check
                 check (status in ('pending', 'confirmed', 'cancelled')),
  created_at   timestamptz not null default now()
);

-- ============================================================
-- Reviews
-- ============================================================
create table reviews (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references users(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  booking_id  uuid references bookings(id) on delete set null,
  rating      smallint not null check (rating between 1 and 5),
  body        text,
  created_at  timestamptz not null default now(),
  unique (user_id, booking_id)
);

-- ============================================================
-- V2: Products & Pricing
-- ============================================================
create table products (
  id       uuid primary key default uuid_generate_v4(),
  name     text not null,
  name_mn  text,
  barcode  text unique,
  unit     text,
  category text
);

create table business_products (
  id          uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  product_id  uuid not null references products(id) on delete cascade,
  price       numeric(10,2) not null,
  updated_at  timestamptz not null default now(),
  unique (business_id, product_id)
);

create trigger business_products_updated_at
  before update on business_products
  for each row execute function set_updated_at();

create table price_history (
  id                  uuid primary key default uuid_generate_v4(),
  business_product_id uuid not null references business_products(id) on delete cascade,
  price               numeric(10,2) not null,
  source              price_source  not null,
  recorded_at         timestamptz   not null default now()
);

create table receipts (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references users(id) on delete cascade,
  business_id uuid references businesses(id) on delete set null,
  image_url   text not null,
  parsed_data jsonb,
  status      receipt_status not null default 'pending',
  uploaded_at timestamptz    not null default now()
);

-- ============================================================
-- Indexes
-- ============================================================
create index businesses_location_idx    on businesses using gist(location);
create index businesses_category_idx    on businesses(category_id);
create index businesses_district_idx    on businesses(district);
create index businesses_active_idx      on businesses(is_active) where is_active = true;
create index businesses_external_id_idx on businesses(external_id) where external_id is not null;

create index bookings_user_id_idx       on bookings(user_id);
create index bookings_place_id_idx      on bookings(place_id);
create index bookings_booked_date_idx   on bookings(booked_date);
create index bookings_status_idx        on bookings(status);

create index reviews_business_id_idx    on reviews(business_id);

create index price_history_bp_idx       on price_history(business_product_id);
create index price_history_time_idx     on price_history(recorded_at);

-- ============================================================
-- Row Level Security
-- ============================================================
alter table users             enable row level security;
alter table businesses        enable row level security;
alter table business_hours    enable row level security;
alter table services          enable row level security;
alter table staff             enable row level security;
alter table staff_services    enable row level security;
alter table bookings          enable row level security;
alter table reviews           enable row level security;
alter table products          enable row level security;
alter table business_products enable row level security;
alter table price_history     enable row level security;
alter table receipts          enable row level security;

-- users: read/update own row only
create policy "users: read own"   on users for select using (auth.uid() = id);
create policy "users: update own" on users for update using (auth.uid() = id);

-- businesses: anyone can read active listings
create policy "businesses: public read"
  on businesses for select
  using (is_active = true);

create policy "businesses: owner update"
  on businesses for update
  using (auth.uid() = owner_id);

-- business_hours, services, staff: public read
create policy "business_hours: public read" on business_hours  for select using (true);
create policy "services: public read"       on services        for select using (true);
create policy "staff: public read"          on staff           for select using (true);
create policy "staff_services: public read" on staff_services  for select using (true);

create policy "business_hours: owner write"
  on business_hours for all
  using (
    exists (select 1 from businesses b where b.id = business_id and b.owner_id = auth.uid())
  );

create policy "services: owner write"
  on services for all
  using (
    exists (select 1 from businesses b where b.id = business_id and b.owner_id = auth.uid())
  );

create policy "staff: owner write"
  on staff for all
  using (
    exists (select 1 from businesses b where b.id = business_id and b.owner_id = auth.uid())
  );

-- bookings: users see their own; place owner sees bookings for their place
-- (owner read goes through business_owners; the owner-update policy is added
-- in 20260503000001 and tightened in 20260510000001 to require verification.)
create policy "bookings: read own"
  on bookings for select
  using (
    auth.uid() = user_id or
    exists (
      select 1 from public.business_owners bo
      where bo.place_id = bookings.place_id
        and bo.user_id  = auth.uid()
    )
  );

-- Insert: authenticated users insert their own; anonymous guest bookings
-- (user_id null) are allowed so the public booking flow works without account.
create policy "bookings: insert own"
  on bookings for insert
  with check (auth.uid() = user_id or user_id is null);

create policy "bookings: update own"
  on bookings for update
  using (auth.uid() = user_id);

-- reviews: public read; authenticated insert; own update
create policy "reviews: public read"  on reviews for select using (true);
create policy "reviews: insert own"   on reviews for insert with check (auth.uid() = user_id);
create policy "reviews: update own"   on reviews for update using (auth.uid() = user_id);

-- products: public read (no PII)
create policy "products: public read"          on products          for select using (true);
create policy "business_products: public read" on business_products for select using (true);
create policy "price_history: public read"     on price_history     for select using (true);

-- receipts: users manage their own
create policy "receipts: read own"   on receipts for select using (auth.uid() = user_id);
create policy "receipts: insert own" on receipts for insert with check (auth.uid() = user_id);
