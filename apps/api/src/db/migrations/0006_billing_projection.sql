create table if not exists billing_customers (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text not null unique,
  email text not null,
  display_name text,
  stripe_customer_id text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text not null,
  stripe_customer_id text not null,
  stripe_subscription_id text not null unique,
  stripe_price_id text,
  status text not null,
  current_period_end timestamptz,
  latest_stripe_event_id text,
  latest_stripe_event_created_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists billing_subscriptions_clerk_user_id_idx
  on billing_subscriptions (clerk_user_id);

create table if not exists billing_events (
  stripe_event_id text primary key,
  event_type text not null,
  livemode boolean not null,
  stripe_created_at timestamptz not null,
  processing_status text not null check (processing_status in ('processed', 'ignored', 'failed')),
  related_clerk_user_id text,
  related_customer_id text,
  related_subscription_id text,
  error_message text,
  created_at timestamptz not null default now()
);
