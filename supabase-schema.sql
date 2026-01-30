-- ChompChange Database Schema
-- Run this in the Supabase SQL Editor

-- Enable RLS on all tables
create extension if not exists "uuid-ossp";

-- Categories (Food, Drinks, etc.)
create table categories (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

alter table categories enable row level security;
create policy "Users can manage their own categories"
  on categories for all using (auth.uid() = user_id);

-- Tiers within each category
create table tiers (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null references categories(id) on delete cascade,
  name text not null,
  min_amount numeric(10,2) not null default 0,
  max_amount numeric(10,2) not null default 0,
  default_value numeric(10,2) not null default 0,
  sort_order int not null default 0,
  color text not null default '#888888',
  created_at timestamptz not null default now()
);

alter table tiers enable row level security;
create policy "Users can manage their own tiers"
  on tiers for all using (auth.uid() = user_id);

-- Budget configurations per month
create table budget_configs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null references categories(id) on delete cascade,
  effective_month date not null, -- first day of month
  created_at timestamptz not null default now(),
  unique(user_id, category_id, effective_month)
);

alter table budget_configs enable row level security;
create policy "Users can manage their own budget configs"
  on budget_configs for all using (auth.uid() = user_id);

-- How many periods allocated to each tier in a budget
create table budget_allocations (
  id uuid primary key default uuid_generate_v4(),
  budget_config_id uuid not null references budget_configs(id) on delete cascade,
  tier_id uuid not null references tiers(id) on delete cascade,
  period_count int not null default 0,
  is_variable boolean not null default false
);

alter table budget_allocations enable row level security;
create policy "Users can manage their own budget allocations"
  on budget_allocations for all
  using (
    exists (
      select 1 from budget_configs
      where budget_configs.id = budget_allocations.budget_config_id
        and budget_configs.user_id = auth.uid()
    )
  );

-- Individual period entries (AM/PM per day)
create table period_entries (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null references categories(id) on delete cascade,
  date date not null,
  period_type text not null check (period_type in ('AM', 'PM')),
  tier_id uuid references tiers(id) on delete set null,
  dollar_amount numeric(10,2),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, category_id, date, period_type)
);

alter table period_entries enable row level security;
create policy "Users can manage their own period entries"
  on period_entries for all using (auth.uid() = user_id);

-- User settings
create table user_settings (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade unique,
  am_start_hour int not null default 6,
  pm_start_hour int not null default 12,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table user_settings enable row level security;
create policy "Users can manage their own settings"
  on user_settings for all using (auth.uid() = user_id);
