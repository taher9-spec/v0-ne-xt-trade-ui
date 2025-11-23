-- USERS: Telegram-based identity
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  telegram_id text unique,
  username text,
  photo_url text,
  plan_code text default 'free',
  approx_balance numeric(12,2) default 500,
  risk_percent numeric(5,2) default 1.0,
  main_market text default 'gold',
  created_at timestamptz default now()
);

-- PLANS: configuration for Free / Starter / Pro / Elite
create table if not exists public.plans (
  code text primary key,
  name text not null,
  price_usd numeric(10,2) not null,
  description text,
  features jsonb default '{}'::jsonb,
  sort_order int default 0
);

-- SUBSCRIPTIONS: user's active / expired subscriptions
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  plan_code text references public.plans(code),
  status text not null default 'active',
  payment_method text,
  payment_ref text,
  start_at timestamptz default now(),
  end_at timestamptz
);

-- SIGNALS: what you push daily
create table if not exists public.signals (
  id uuid primary key default gen_random_uuid(),
  symbol text not null,
  direction text not null,
  type text not null,
  market text not null,
  entry numeric(18,6) not null,
  sl numeric(18,6) not null,
  tp1 numeric(18,6),
  tp2 numeric(18,6),
  confidence int default 3,
  reason_summary text,
  meta jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- TRADES: user's journal of taken signals
create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  signal_id uuid references public.signals(id) on delete set null,
  symbol text not null,
  direction text not null,
  entry_price numeric(18,6),
  exit_price numeric(18,6),
  timeframe text,
  result_r numeric(10,4),
  pnl numeric(12,2),
  status text not null,
  opened_at timestamptz default now(),
  closed_at timestamptz
);

-- Enable RLS on all tables
alter table public.users enable row level security;
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.signals enable row level security;
alter table public.trades enable row level security;

-- RLS Policies for users (users can only see/edit their own data)
create policy "Users can view their own data"
  on public.users for select
  using (id = auth.uid());

create policy "Users can update their own data"
  on public.users for update
  using (id = auth.uid());

-- RLS Policies for plans (public read)
create policy "Anyone can view plans"
  on public.plans for select
  using (true);

-- RLS Policies for subscriptions (users can only see their own)
create policy "Users can view their own subscriptions"
  on public.subscriptions for select
  using (user_id = auth.uid());

-- RLS Policies for signals (public read)
create policy "Anyone can view signals"
  on public.signals for select
  using (true);

-- RLS Policies for trades (users can only see/manage their own)
create policy "Users can view their own trades"
  on public.trades for select
  using (user_id = auth.uid());

create policy "Users can insert their own trades"
  on public.trades for insert
  with check (user_id = auth.uid());

create policy "Users can update their own trades"
  on public.trades for update
  using (user_id = auth.uid());

create policy "Users can delete their own trades"
  on public.trades for delete
  using (user_id = auth.uid());
