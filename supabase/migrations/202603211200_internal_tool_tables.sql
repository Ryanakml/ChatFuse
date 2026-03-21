begin;

-- ============================================================
-- 1. internal_orders
-- ============================================================
create table internal_orders (
  id uuid primary key default gen_random_uuid(),
  external_order_id text not null unique,
  customer_phone text not null,
  customer_email text,
  status text not null,
  payment_status text,
  fulfillment_status text,
  currency text,
  total_amount numeric,
  placed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 2. internal_order_shipments
-- ============================================================
create table internal_order_shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references internal_orders(id) on delete cascade,
  courier_name text,
  tracking_number text,
  shipping_status text,
  estimated_delivery timestamptz,
  shipped_at timestamptz,
  delivered_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

-- ============================================================
-- 3. internal_products
-- ============================================================
create table internal_products (
  id uuid primary key default gen_random_uuid(),
  external_product_id text not null unique,
  name text not null,
  description text,
  price numeric not null,
  currency text not null default 'USD',
  category text,
  in_stock boolean not null default true,
  stock_qty integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- 4. internal_shipping_rules
-- ============================================================
create table internal_shipping_rules (
  id uuid primary key default gen_random_uuid(),
  origin_country text not null,
  destination_country text not null,
  destination_city text,
  weight_min_kg numeric not null default 0,
  weight_max_kg numeric,
  service_level text not null,
  courier_name text,
  cost numeric not null,
  currency text not null default 'USD',
  estimated_days_min integer,
  estimated_days_max integer,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

commit;
