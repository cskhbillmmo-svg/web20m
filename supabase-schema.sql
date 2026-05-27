-- =====================================================================
-- Kinglove69 â€” Supabase schema
-- Run this entire file in Supabase SQL Editor (Project â†’ SQL Editor â†’ New query)
-- It is idempotent: safe to re-run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PROFILES  (extends auth.users with app-level fields)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  username        text unique not null,
  display_name    text,
  real_name       text,
  gender          text check (gender in ('male','female','other','unknown')) default 'unknown',
  invite_code     text,
  balance_points  integer not null default 0,   -- "Sá»‘ Ä‘iá»ƒm hiá»‡n cÃ³"
  vote_points     integer not null default 0,   -- "Sá»‘ Ä‘iá»ƒm Vote"
  advance_points  integer not null default 0,   -- "Sá»‘ Ä‘iá»ƒm táº¡m á»©ng"
  auto_points     integer not null default 0,   -- "Sá»‘ Ä‘iá»ƒm tá»± Ä‘á»™ng"
  kid_points      integer not null default 0,   -- "Sá»‘ Ä‘iá»ƒm Vote cá»§a bÃ©"
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles read own"    on public.profiles;
drop policy if exists "profiles update own"  on public.profiles;
drop policy if exists "profiles insert own"  on public.profiles;
create policy "profiles read own"   on public.profiles for select using (auth.uid() = id);
create policy "profiles update own" on public.profiles for update using (auth.uid() = id);
create policy "profiles insert own" on public.profiles for insert with check (auth.uid() = id);

-- Auto-create a profile row when a new auth user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'username')
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------------
-- 2. BANK ACCOUNTS  (ThÃ´ng tin ngÃ¢n hÃ ng / LiÃªn káº¿t)
-- ---------------------------------------------------------------------
create table if not exists public.bank_accounts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  bank_name       text not null,
  account_number  text not null,
  account_holder  text not null,
  is_primary      boolean not null default false,
  created_at      timestamptz not null default now()
);

create index if not exists bank_accounts_user_idx on public.bank_accounts(user_id);

alter table public.bank_accounts enable row level security;
drop policy if exists "bank own all" on public.bank_accounts;
create policy "bank own all" on public.bank_accounts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- 3. TRANSACTIONS  (Lá»‹ch sá»­ rÃºt / náº¡p / vote / thÆ°á»Ÿng)
-- ---------------------------------------------------------------------
create table if not exists public.transactions (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  type        text not null check (type in ('deposit','withdraw','vote','reward','refund')),
  amount      integer not null,
  status      text not null default 'pending' check (status in ('pending','success','failed','cancelled')),
  note        text,
  metadata    jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists transactions_user_idx on public.transactions(user_id, created_at desc);
create index if not exists transactions_type_idx on public.transactions(type, created_at desc);

alter table public.transactions enable row level security;
drop policy if exists "tx read own" on public.transactions;
create policy "tx read own" on public.transactions for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- 4. VOTE HISTORY  (Lá»‹ch sá»­ VOTE â€” secret list, há»™i viÃªn khÃ´ng xem Ä‘Æ°á»£c)
-- ---------------------------------------------------------------------
create table if not exists public.vote_history (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  vote_type   integer not null check (vote_type in (1,2,3)),
  amount      integer not null,
  result      text,
  is_secret   boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists vote_history_user_idx on public.vote_history(user_id, created_at desc);

alter table public.vote_history enable row level security;
-- Per business rule: vote history is secret, members cannot read it
drop policy if exists "vote_history no read" on public.vote_history;
-- (no select policy = nothing readable via anon/auth client â€” only via service_role)

-- ---------------------------------------------------------------------
-- 5. NOTIFICATIONS  (ThÃ´ng bÃ¡o há»‡ thá»‘ng)
-- ---------------------------------------------------------------------
create table if not exists public.notifications (
  id          bigserial primary key,
  title       text not null,
  body        text not null,
  audience    text not null default 'all' check (audience in ('all','user')),
  user_id     uuid references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

create index if not exists notifications_audience_idx on public.notifications(audience, created_at desc);
create index if not exists notifications_user_idx on public.notifications(user_id, created_at desc);

alter table public.notifications enable row level security;
drop policy if exists "notif read public or own" on public.notifications;
create policy "notif read public or own" on public.notifications for select
  using (audience = 'all' or user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 6. VIDEO CATEGORIES + VIDEOS  (Ráº¡p chiáº¿u)
-- ---------------------------------------------------------------------
create table if not exists public.video_categories (
  id          integer primary key,
  name        text not null,
  sort_order  integer not null default 0
);

insert into public.video_categories (id, name, sort_order) values
  (1, 'Viá»‡t nam', 1),
  (2, 'Má»›i nháº¥t',  2),
  (3, 'Hot nháº¥t',  3)
on conflict (id) do update set name = excluded.name, sort_order = excluded.sort_order;

alter table public.video_categories enable row level security;
drop policy if exists "category public read" on public.video_categories;
create policy "category public read" on public.video_categories for select using (true);

create table if not exists public.videos (
  id            bigserial primary key,
  external_id   bigint unique,
  category_id   integer not null references public.video_categories(id) on delete restrict,
  title         text not null,
  cover         text,
  play_count    integer not null default 0,
  duration      text,
  is_popular    boolean not null default false,
  popular_rank  integer check (popular_rank between 1 and 3),
  created_at    timestamptz not null default now()
);

create index if not exists videos_category_idx on public.videos(category_id, play_count desc);
create index if not exists videos_popular_idx  on public.videos(is_popular, popular_rank) where is_popular = true;

alter table public.videos enable row level security;
drop policy if exists "videos public read" on public.videos;
create policy "videos public read" on public.videos for select using (true);

-- ---------------------------------------------------------------------
-- 7. SAMPLE SEED for videos (a few rows so you can verify reads work).
-- Real seed (60+ items) will be loaded from the existing cinema.js by a script
-- once auth is wired. Comment this block out if you want a clean start.
-- ---------------------------------------------------------------------
insert into public.videos (external_id, category_id, title, cover, play_count, is_popular, popular_rank) values
  (17950, 1, 'Em gÃ¡i Ã¡o mÃ u xanh dÃ¢m dá»¥c!', 'https://lsbzytp.com:3519/upload/vod/20231130-1/56781ca51d5b3e0136480a1b52265241.jpg', 7903, true, 1),
  (16172, 1, 'NgÃ  Ngá»©a táº­p 02', 'https://lbfm.lbpictupian.com/upload/vod/2020/04-23/12/ou33pbvpimo1202ou33pbvpimo2310671.jpg', 329, true, 2),
  (15910, 1, 'Em gÃ¡i trong sÃ¡ng Táº­p 02', 'https://lbfm.lbpictupian.com/upload/vod/2020/04-14/12/x5las3e5j3z1211x5las3e5j3z356326.jpg', 524, true, 3),
  (14589, 1, 'ABS-199 Bá»™ SÆ°u Táº­p Karen Aoki 07', 'https://lbfm.lbpictupian.com/upload/vod/2020/04-25/00/5n2qmc1jbhe00035n2qmc1jbhe0912831.jpg', 144, false, null),
  (18050, 2, 'HoÃ ng gia Trung Quá»‘c', 'https://img.img1yutu.com:3451/upload/vod/20230421-1/eae277d409e70101ec55ddb5b3ea91ea.jpg', 3771, false, null)
on conflict (external_id) do nothing;

-- ---------------------------------------------------------------------
-- 8. SAMPLE notification (so ThÃ´ng bÃ¡o screen has content immediately)
-- ---------------------------------------------------------------------
insert into public.notifications (title, body, audience) values
  ('Hoáº¡t Ä‘á»™ng trÃªn khÃ´ng',
   'Cáº£m Æ¡n báº¡n Ä‘Ã£ tin tÆ°á»Ÿng vÃ  tÃ¬m Ä‘áº¿n KINGLOVE69 CLB. CLB chÃºng tÃ´i cÃ³ thá»ƒ tá»“n táº¡i Ä‘áº¿n bÃ¢y giá» lÃ  dá»±a vÃ o sá»± tin tÆ°á»Ÿng cá»§a má»i ngÆ°á»i vÃ  sá»± á»§ng há»™ nhiá»‡t tÃ¬nh cá»§a táº¥t cáº£ cÃ¡c há»™i viÃªn.',
   'all')
on conflict do nothing;
