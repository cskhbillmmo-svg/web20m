-- =====================================================================
-- Onenight — Admin role + VOTE game schema (matches admin.js)
-- Run in Supabase SQL Editor AFTER supabase-schema.sql.
-- Idempotent — safe to re-run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ADMIN ROLE on profiles
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists role text not null default 'member'
    check (role in ('member','admin','superadmin'));

create index if not exists profiles_role_idx on public.profiles(role) where role <> 'member';

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin','superadmin')
  );
$$;

-- Admin can read/update all profiles (own policies already there for members)
drop policy if exists "admin read all profiles"   on public.profiles;
drop policy if exists "admin update all profiles" on public.profiles;
create policy "admin read all profiles"   on public.profiles for select using (public.is_admin());
create policy "admin update all profiles" on public.profiles for update using (public.is_admin());

drop policy if exists "admin read tx"   on public.transactions;
drop policy if exists "admin update tx" on public.transactions;
create policy "admin read tx"   on public.transactions for select using (public.is_admin());
create policy "admin update tx" on public.transactions for update using (public.is_admin());

drop policy if exists "admin read banks" on public.bank_accounts;
create policy "admin read banks" on public.bank_accounts for select using (public.is_admin());

drop policy if exists "admin insert notif" on public.notifications;
create policy "admin insert notif" on public.notifications for insert with check (public.is_admin());

-- ---------------------------------------------------------------------
-- 2. VOTE ROUNDS  (one row per draw cycle, per game type)
-- ---------------------------------------------------------------------
create table if not exists public.vote_rounds (
  id          bigserial primary key,
  vote_type   integer not null check (vote_type in (1,2,3)),
  round_no    text not null,
  status      text not null default 'open' check (status in ('open','closed','settled','cancelled')),
  multiplier  numeric(6,2) not null default 2,
  winning     text,
  close_at    timestamptz,
  open_at     timestamptz not null default now(),
  settled_at  timestamptz,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id),
  unique (vote_type, round_no)
);

create index if not exists vote_rounds_status_idx on public.vote_rounds(status, open_at desc);
create index if not exists vote_rounds_type_idx   on public.vote_rounds(vote_type, open_at desc);

alter table public.vote_rounds enable row level security;
drop policy if exists "rounds public read" on public.vote_rounds;
drop policy if exists "rounds admin write" on public.vote_rounds;
create policy "rounds public read" on public.vote_rounds for select using (true);
create policy "rounds admin write" on public.vote_rounds
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- 3. VOTE HISTORY  (existing table — extend with bet fields)
--    Keep old columns (vote_type, amount, result, is_secret) for back-compat.
-- ---------------------------------------------------------------------
alter table public.vote_history
  add column if not exists round_id bigint references public.vote_rounds(id) on delete cascade,
  add column if not exists choice   text,
  add column if not exists payout   integer not null default 0,
  add column if not exists status   text not null default 'pending';

-- Replace the old text "result" check by adding a constraint on status enum.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'vote_history_status_chk'
  ) then
    alter table public.vote_history
      add constraint vote_history_status_chk check (status in ('pending','win','lose','refunded'));
  end if;
end $$;

create index if not exists vote_history_round_idx on public.vote_history(round_id);

-- Extra FK so PostgREST resolves `profiles(username)` embedded select
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'vote_history_profile_fk') then
    alter table public.vote_history
      add constraint vote_history_profile_fk
      foreign key (user_id) references public.profiles(id) on delete cascade;
  end if;
end $$;

alter table public.vote_history enable row level security;
drop policy if exists "vote_history no read"   on public.vote_history;
drop policy if exists "bets read own"          on public.vote_history;
drop policy if exists "bets insert own"        on public.vote_history;
drop policy if exists "bets admin all"         on public.vote_history;
create policy "bets read own"   on public.vote_history for select using (auth.uid() = user_id);
create policy "bets insert own" on public.vote_history for insert with check (auth.uid() = user_id);
create policy "bets admin all"  on public.vote_history for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- 4. VIEW — stats per round (used in admin grid + tables)
-- ---------------------------------------------------------------------
create or replace view public.vote_round_stats as
select
  r.id            as round_id,
  r.vote_type,
  r.round_no,
  r.status,
  r.multiplier,
  r.winning,
  r.open_at,
  r.close_at,
  r.settled_at,
  coalesce(s.bet_count, 0)      as bet_count,
  coalesce(s.total_amount, 0)   as total_amount,
  coalesce(s.unique_bettors, 0) as unique_bettors
from public.vote_rounds r
left join lateral (
  select count(*)::int as bet_count,
         coalesce(sum(amount),0)::int as total_amount,
         count(distinct user_id)::int as unique_bettors
  from public.vote_history h
  where h.round_id = r.id
) s on true;

-- Allow anon/auth to query the view; underlying RLS still applies.
grant select on public.vote_round_stats to anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. RPC — place a bet (member side, used by lottery.js)
-- ---------------------------------------------------------------------
create or replace function public.place_vote_bet(
  p_round_id bigint,
  p_choice   text,
  p_amount   integer
) returns public.vote_history
language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid := auth.uid();
  v_round   public.vote_rounds;
  v_bal     integer;
  v_bet     public.vote_history;
begin
  if v_user_id is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_amount <= 0 then raise exception 'INVALID_AMOUNT'; end if;

  select * into v_round from public.vote_rounds where id = p_round_id for update;
  if not found then raise exception 'ROUND_NOT_FOUND'; end if;
  if v_round.status <> 'open' then raise exception 'ROUND_NOT_OPEN'; end if;
  if v_round.close_at is not null and now() >= v_round.close_at then
    raise exception 'ROUND_CLOSED';
  end if;

  select balance_points into v_bal from public.profiles where id = v_user_id for update;
  if v_bal is null or v_bal < p_amount then raise exception 'INSUFFICIENT_BALANCE'; end if;

  update public.profiles
    set balance_points = balance_points - p_amount, updated_at = now()
    where id = v_user_id;

  insert into public.vote_history(round_id, user_id, vote_type, choice, amount, status, is_secret)
    values (p_round_id, v_user_id, v_round.vote_type, p_choice, p_amount, 'pending', true)
    returning * into v_bet;

  insert into public.transactions(user_id, type, amount, status, note, metadata)
    values (v_user_id, 'vote', p_amount, 'success',
            'Đặt cược VOTE' || v_round.vote_type::text || ' - ' || v_round.round_no,
            jsonb_build_object('bet_id', v_bet.id, 'round_id', p_round_id, 'choice', p_choice));

  return v_bet;
end $$;

grant execute on function public.place_vote_bet(bigint, text, integer) to authenticated;

-- ---------------------------------------------------------------------
-- 6. RPC — admin settles a round
--    Rule: bet wins if its choice (single token OR comma list) shares at least
--    one token with the winning string.  Payout = amount * multiplier.
-- ---------------------------------------------------------------------
create or replace function public.settle_round(
  p_round_id bigint,
  p_winning  text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_round   public.vote_rounds;
  r         record;
  v_winners integer := 0;
  v_total   integer := 0;
  v_payout  integer;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;

  select * into v_round from public.vote_rounds where id = p_round_id for update;
  if not found then raise exception 'ROUND_NOT_FOUND'; end if;
  if v_round.status = 'settled' then raise exception 'ALREADY_SETTLED'; end if;

  update public.vote_rounds
    set winning = p_winning, status = 'settled', settled_at = now()
    where id = p_round_id
    returning * into v_round;

  for r in
    select * from public.vote_history where round_id = p_round_id and status = 'pending'
  loop
    if string_to_array(coalesce(r.choice,''), ',') && string_to_array(p_winning, ',') then
      v_payout := (r.amount * v_round.multiplier)::integer;
      update public.vote_history set status = 'win', payout = v_payout where id = r.id;
      update public.profiles
        set balance_points = balance_points + v_payout, updated_at = now()
        where id = r.user_id;
      insert into public.transactions(user_id, type, amount, status, note, metadata)
        values (r.user_id, 'reward', v_payout, 'success',
                'Thắng VOTE - ' || v_round.round_no,
                jsonb_build_object('bet_id', r.id, 'round_id', p_round_id));
      v_winners := v_winners + 1;
      v_total   := v_total + v_payout;
    else
      update public.vote_history set status = 'lose' where id = r.id;
    end if;
  end loop;

  return jsonb_build_object('winners', v_winners, 'total_payout', v_total);
end $$;

grant execute on function public.settle_round(bigint, text) to authenticated;

-- ---------------------------------------------------------------------
-- 7. RPC — admin adjust balance (used by Users tab "Sửa số dư")
-- ---------------------------------------------------------------------
create or replace function public.admin_set_balance(
  p_user_id uuid,
  p_balance integer,
  p_note    text default 'Admin set balance'
) returns integer
language plpgsql security definer set search_path = public as $$
declare v_old integer;
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  select balance_points into v_old from public.profiles where id = p_user_id;
  if v_old is null then raise exception 'USER_NOT_FOUND'; end if;
  update public.profiles set balance_points = p_balance, updated_at = now() where id = p_user_id;
  insert into public.transactions(user_id, type, amount, status, note)
    values (p_user_id,
            case when p_balance >= v_old then 'reward' else 'refund' end,
            abs(p_balance - v_old), 'success', p_note);
  return p_balance;
end $$;

grant execute on function public.admin_set_balance(uuid, integer, text) to authenticated;

-- ---------------------------------------------------------------------
-- 8. Seed: one open round per game type (so admin grid không trống)
-- ---------------------------------------------------------------------
insert into public.vote_rounds (vote_type, round_no, multiplier, close_at) values
  (1, to_char(now(), 'YYYYMMDD') || '-001', 2.0, now() + interval '10 minutes'),
  (2, to_char(now(), 'YYYYMMDD') || '-001', 3.0, now() + interval '15 minutes'),
  (3, to_char(now(), 'YYYYMMDD') || '-001', 5.0, now() + interval '20 minutes')
on conflict (vote_type, round_no) do nothing;
