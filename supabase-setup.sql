-- ─────────────────────────────────────────────────────────────────
-- TuitionDesk — Supabase Database Setup
-- Run this ONCE in Supabase → SQL Editor → New Query → Run
-- ─────────────────────────────────────────────────────────────────

-- 1. TUITIONS
create table if not exists tuitions (
  id            text primary key,
  user_id       uuid references auth.users(id) on delete cascade not null,
  name          text not null,
  subject       text,
  fee_mode      text default 'class',
  fee_amount    numeric default 0,
  classes_per_month integer default 12,
  color         text default '#818cf8',
  created_at    timestamptz default now()
);
alter table tuitions enable row level security;
create policy "Users own tuitions" on tuitions
  for all using (auth.uid() = user_id);

-- 2. SESSIONS
create table if not exists sessions (
  id            text primary key,
  user_id       uuid references auth.users(id) on delete cascade not null,
  tuition_id    text references tuitions(id) on delete cascade,
  date          text not null,
  time_slot     text,
  note          text,
  backfilled    boolean default false,
  created_at    timestamptz default now()
);
alter table sessions enable row level security;
create policy "Users own sessions" on sessions
  for all using (auth.uid() = user_id);

-- 3. EARNINGS
create table if not exists earnings (
  id            text primary key,
  user_id       uuid references auth.users(id) on delete cascade not null,
  date          text not null,
  tuition_name  text,
  amount        numeric default 0,
  notes         text,
  created_at    timestamptz default now()
);
alter table earnings enable row level security;
create policy "Users own earnings" on earnings
  for all using (auth.uid() = user_id);

-- 4. EXPENSES
create table if not exists expenses (
  id            text primary key,
  user_id       uuid references auth.users(id) on delete cascade not null,
  date          text not null,
  product       text,
  category      text,
  amount        numeric default 0,
  notes         text,
  created_at    timestamptz default now()
);
alter table expenses enable row level security;
create policy "Users own expenses" on expenses
  for all using (auth.uid() = user_id);

-- Done! ✓
