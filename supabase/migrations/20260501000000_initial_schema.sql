-- ============================================================
-- Extensions
-- ============================================================
create extension if not exists "uuid-ossp";
create extension if not exists "postgis";

-- ============================================================
-- Enums
-- ============================================================
create type booking_type   as enum ('reservation', 'appointment', 'queue');
create type booking_status as enum ('pending', 'confirmed', 'cancelled', 'completed', 'no_show');
create type price_source   as enum ('receipt', 'owner', 'manual');
create type receipt_status as enum ('pending', 'processed', 'failed');
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
-- Businesses
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
  external_id     text unique,  -- Google Places ID for deduplication
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger businesses_updated_at
  before update on businesses
  for each row execute function set_updated_at();

-- ============================================================
-- Business Hours
-- ============================================================
create table business_hours (
  id          uuid primary key default uuid_generate_v4(),
  business_id uuid not null references businesses(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),  -- 0=Mon, 6=Sun
  open_time   time,
  close_time  time,
  is_closed   boolean not null default false
);
-- Note: no (business_id, day_of_week) unique — Google Places returns split shifts
-- (e.g. restaurant 09:00–14:00 and 18:00–22:00 on the same day).

-- ============================================================
-- Services  (bookable offerings within a business)
-- ============================================================
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

-- ============================================================
-- Staff
-- ============================================================
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
create table bookings (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references users(id) on delete cascade,
  business_id  uuid not null references businesses(id) on delete cascade,
  service_id   uuid references services(id) on delete set null,
  staff_id     uuid references staff(id) on delete set null,
  booking_type booking_type   not null,
  status       booking_status not null default 'pending',
  scheduled_at timestamptz    not null,
  party_size   smallint,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger bookings_updated_at
  before update on bookings
  for each row execute function set_updated_at();

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
  unique (user_id, booking_id)  -- one review per booking
);

-- ============================================================
-- V2: Products & Pricing
-- ============================================================
create table products (
  id       uuid primary key default uuid_generate_v4(),
  name     text not null,
  name_mn  text,
  barcode  text unique,
  unit     text,   -- 'kg', 'piece', '500ml', etc.
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

-- Append-only price log — never update rows, only insert
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

-- Geospatial: find businesses within radius of user
create index businesses_location_idx    on businesses using gist(location);

-- Business filters
create index businesses_category_idx    on businesses(category_id);
create index businesses_district_idx    on businesses(district);
create index businesses_active_idx      on businesses(is_active) where is_active = true;
create index businesses_external_id_idx on businesses(external_id) where external_id is not null;

-- Booking lookups
create index bookings_user_id_idx       on bookings(user_id);
create index bookings_business_id_idx   on bookings(business_id);
create index bookings_scheduled_at_idx  on bookings(scheduled_at);
create index bookings_status_idx        on bookings(status);

-- Reviews
create index reviews_business_id_idx    on reviews(business_id);

-- Price history time-series
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

-- businesses: owner can update their listing
create policy "businesses: owner update"
  on businesses for update
  using (auth.uid() = owner_id);

-- business_hours, services, staff: public read
create policy "business_hours: public read" on business_hours  for select using (true);
create policy "services: public read"       on services        for select using (true);
create policy "staff: public read"          on staff           for select using (true);
create policy "staff_services: public read" on staff_services  for select using (true);

-- business_hours, services, staff: owner write
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

-- bookings: users see their own; business owner sees bookings for their business
create policy "bookings: read own"
  on bookings for select
  using (
    auth.uid() = user_id or
    exists (select 1 from businesses b where b.id = business_id and b.owner_id = auth.uid())
  );

create policy "bookings: insert own"
  on bookings for insert
  with check (auth.uid() = user_id);

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
