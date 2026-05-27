-- =====================================================================
-- Kinglove69 — Admin & Vote schema (run after supabase-schema.sql)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Add role to profiles
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists role text not null default 'member'
    check (role in ('member','admin'));

-- Helper function — avoids recursion in RLS policies
create or replace function public.is_admin(uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce((select role = 'admin' from public.profiles where id = uid), false);
$$;

-- ---------------------------------------------------------------------
-- 1b. INVITE CODES (admin-issued referral codes for registration)
-- ---------------------------------------------------------------------
create table if not exists public.invite_codes (
  code text primary key,
  created_by uuid references auth.users(id) on delete set null,
  status text not null default 'active' check (status in ('active','disabled')),
  created_at timestamptz not null default now()
);

alter table public.invite_codes enable row level security;
drop policy if exists "invite_codes select active" on public.invite_codes;
create policy "invite_codes select active" on public.invite_codes
  for select using (status = 'active');
drop policy if exists "invite_codes admin all" on public.invite_codes;
create policy "invite_codes admin all" on public.invite_codes
  for all using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- Allow admin to read all profiles
drop policy if exists "profiles admin read all" on public.profiles;
create policy "profiles admin read all" on public.profiles
  for select using (public.is_admin(auth.uid()));

drop policy if exists "profiles admin update all" on public.profiles;
create policy "profiles admin update all" on public.profiles
  for update using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- ---------------------------------------------------------------------
-- 2. VOTE rounds — admin creates rounds, sets winning result
-- ---------------------------------------------------------------------
create table if not exists public.vote_rounds (
  id           bigserial primary key,
  vote_type    integer not null check (vote_type in (1,2,3)),
  round_no     text not null,
  status       text not null default 'open' check (status in ('open','closed','settled')),
  multiplier   numeric(6,2) not null default 2.0,
  open_at      timestamptz not null default now(),
  close_at     timestamptz,
  settle_at    timestamptz,
  winning      text,
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now(),
  unique (vote_type, round_no)
);

create index if not exists vote_rounds_active_idx
  on public.vote_rounds(vote_type, status);

alter table public.vote_rounds enable row level security;

-- Members can see open rounds (to know current draw)
drop policy if exists "rounds member read" on public.vote_rounds;
create policy "rounds member read" on public.vote_rounds
  for select using (status in ('open','closed','settled'));

-- Admin can do everything
drop policy if exists "rounds admin all" on public.vote_rounds;
create policy "rounds admin all" on public.vote_rounds
  for all using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- ---------------------------------------------------------------------
-- 3. Augment vote_history with round + choice + payout
-- ---------------------------------------------------------------------
alter table public.vote_history
  add column if not exists round_id bigint references public.vote_rounds(id) on delete set null,
  add column if not exists choice   text,
  add column if not exists payout   integer not null default 0,
  add column if not exists status   text not null default 'pending'
    check (status in ('pending','win','lose','refund'));

create index if not exists vote_history_round_idx on public.vote_history(round_id);

-- Members can INSERT their own bet
drop policy if exists "vote_history insert own" on public.vote_history;
create policy "vote_history insert own" on public.vote_history
  for insert with check (auth.uid() = user_id);

-- Admin can do everything
drop policy if exists "vote_history admin all" on public.vote_history;
create policy "vote_history admin all" on public.vote_history
  for all using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- ---------------------------------------------------------------------
-- 4. Settle round — RPC function admin calls to close + auto-payout
-- ---------------------------------------------------------------------
create or replace function public.settle_round(p_round_id bigint, p_winning text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.vote_rounds;
  bet record;
  total_winners integer := 0;
  total_payout integer := 0;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'forbidden';
  end if;

  select * into r from public.vote_rounds where id = p_round_id;
  if r is null then raise exception 'round not found'; end if;
  if r.status = 'settled' then raise exception 'round already settled'; end if;

  for bet in
    select id, user_id, amount, choice
    from public.vote_history where round_id = p_round_id
  loop
    if bet.choice = p_winning then
      update public.vote_history
        set status = 'win',
            payout = (bet.amount * r.multiplier)::integer,
            result = p_winning
      where id = bet.id;
      update public.profiles
        set balance_points = balance_points + (bet.amount * r.multiplier)::integer
      where id = bet.user_id;
      total_winners := total_winners + 1;
      total_payout := total_payout + (bet.amount * r.multiplier)::integer;
    else
      update public.vote_history
        set status = 'lose', result = p_winning
      where id = bet.id;
    end if;
  end loop;

  update public.vote_rounds
    set status = 'settled', winning = p_winning, settle_at = now()
  where id = p_round_id;

  return jsonb_build_object(
    'round_id', p_round_id,
    'winning', p_winning,
    'winners', total_winners,
    'total_payout', total_payout
  );
end $$;

-- ---------------------------------------------------------------------
-- 5. Place bet — RPC for members (atomic deduct + insert)
-- ---------------------------------------------------------------------
create or replace function public.place_bet(p_round_id bigint, p_choice text, p_amount integer)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  r public.vote_rounds;
  bal integer;
  bet_id bigint;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_amount <= 0 then raise exception 'amount must be positive'; end if;

  select * into r from public.vote_rounds where id = p_round_id;
  if r is null then raise exception 'round not found'; end if;
  if r.status <> 'open' then raise exception 'round closed'; end if;

  select balance_points into bal from public.profiles where id = uid;
  if bal < p_amount then raise exception 'insufficient balance'; end if;

  update public.profiles set balance_points = balance_points - p_amount where id = uid;

  insert into public.vote_history (user_id, round_id, vote_type, choice, amount, status, is_secret)
  values (uid, p_round_id, r.vote_type, p_choice, p_amount, 'pending', true)
  returning id into bet_id;

  return bet_id;
end $$;

-- ---------------------------------------------------------------------
-- 6b. Delete round with refund — admin only, atomic
-- ---------------------------------------------------------------------
create or replace function public.delete_round_with_refund(p_round_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  bet record;
  refunded integer := 0;
  bet_count integer := 0;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'forbidden';
  end if;

  -- Cannot delete settled rounds (data integrity)
  if exists (select 1 from public.vote_rounds where id = p_round_id and status = 'settled') then
    raise exception 'cannot delete settled round';
  end if;

  for bet in
    select user_id, amount from public.vote_history where round_id = p_round_id
  loop
    update public.profiles
      set balance_points = balance_points + bet.amount
      where id = bet.user_id;
    refunded := refunded + bet.amount;
    bet_count := bet_count + 1;
  end loop;

  delete from public.vote_history where round_id = p_round_id;
  delete from public.vote_rounds where id = p_round_id;

  return jsonb_build_object(
    'round_id', p_round_id,
    'bets_deleted', bet_count,
    'total_refunded', refunded
  );
end $$;

-- ---------------------------------------------------------------------
-- 6b2. Bank accounts — chỉ 1 bank/user; admin được sửa của ai cũng được
-- ---------------------------------------------------------------------
-- Hard limit: mỗi user chỉ có tối đa 1 bank account (unique constraint)
create unique index if not exists bank_accounts_one_per_user
  on public.bank_accounts(user_id);

-- User chỉ insert nếu chưa có (unique index ở trên enforce)
-- User KHÔNG được update/delete bank của mình (chỉ admin được sửa)
drop policy if exists "bank own all" on public.bank_accounts;
drop policy if exists "bank read own" on public.bank_accounts;
drop policy if exists "bank insert own" on public.bank_accounts;
drop policy if exists "bank insert own once" on public.bank_accounts;

create policy "bank read own" on public.bank_accounts
  for select using (auth.uid() = user_id);

create policy "bank insert own once" on public.bank_accounts
  for insert with check (
    auth.uid() = user_id
    and not exists (select 1 from public.bank_accounts where user_id = auth.uid())
  );

-- Admin full access (read/update/delete cho mọi user)
drop policy if exists "bank admin all" on public.bank_accounts;
create policy "bank admin all" on public.bank_accounts
  for all using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- ---------------------------------------------------------------------
-- 6b3. Transactions — track update time (Trạng thái cột)
-- ---------------------------------------------------------------------
alter table public.transactions
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.touch_tx_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists transactions_touch on public.transactions;
create trigger transactions_touch before update on public.transactions
  for each row execute procedure public.touch_tx_updated_at();

-- ---------------------------------------------------------------------
-- 6c. Transactions — user can insert deposit/withdraw requests
-- ---------------------------------------------------------------------
drop policy if exists "tx insert own pending" on public.transactions;
create policy "tx insert own pending" on public.transactions
  for insert with check (
    auth.uid() = user_id
    and type in ('deposit','withdraw')
    and status = 'pending'
  );

drop policy if exists "tx admin all" on public.transactions;
create policy "tx admin all" on public.transactions
  for all using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- ---------------------------------------------------------------------
-- 6d. Approve / reject transaction — admin RPC, atomic balance update
-- ---------------------------------------------------------------------
create or replace function public.approve_transaction(p_tx_id bigint, p_approve boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  tx public.transactions;
  bal integer;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'forbidden';
  end if;

  select * into tx from public.transactions where id = p_tx_id for update;
  if tx is null then raise exception 'transaction not found'; end if;
  if tx.status <> 'pending' then raise exception 'transaction already processed'; end if;

  if not p_approve then
    update public.transactions set status = 'cancelled' where id = p_tx_id;
    return jsonb_build_object('id', p_tx_id, 'status', 'cancelled');
  end if;

  if tx.type = 'deposit' then
    update public.profiles set balance_points = balance_points + tx.amount where id = tx.user_id;
  elsif tx.type = 'withdraw' then
    select balance_points into bal from public.profiles where id = tx.user_id;
    if bal < tx.amount then
      update public.transactions set status = 'failed', note = coalesce(note,'') || ' [insufficient balance]'
        where id = p_tx_id;
      raise exception 'insufficient balance for withdraw';
    end if;
    update public.profiles set balance_points = balance_points - tx.amount where id = tx.user_id;
  end if;

  update public.transactions set status = 'success' where id = p_tx_id;
  return jsonb_build_object('id', p_tx_id, 'type', tx.type, 'amount', tx.amount, 'status', 'success');
end $$;

-- ---------------------------------------------------------------------
-- 6e. Admin adjust balance — manual +/- points with audit
-- ---------------------------------------------------------------------
-- Mở rộng transaction type enum để có 'admin_adjust'
alter table public.transactions drop constraint if exists transactions_type_check;
alter table public.transactions add constraint transactions_type_check
  check (type in ('deposit','withdraw','vote','reward','refund','admin_adjust'));

create or replace function public.adjust_balance(
  p_user_id uuid,
  p_delta integer,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  new_bal integer;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'forbidden';
  end if;
  if p_delta = 0 then
    raise exception 'delta cannot be zero';
  end if;

  update public.profiles
    set balance_points = balance_points + p_delta
    where id = p_user_id
    returning balance_points into new_bal;

  if new_bal is null then raise exception 'user not found'; end if;
  if new_bal < 0 then
    -- rollback
    update public.profiles set balance_points = balance_points - p_delta where id = p_user_id;
    raise exception 'insufficient balance after deduction (would be %)', new_bal;
  end if;

  insert into public.transactions (user_id, type, amount, status, note)
  values (
    p_user_id,
    'admin_adjust',
    abs(p_delta),
    'success',
    coalesce(nullif(p_note, ''), case when p_delta > 0 then 'Admin cộng điểm' else 'Admin trừ điểm' end)
      || ' (' || case when p_delta > 0 then '+' else '' end || p_delta::text || ')'
  );

  return jsonb_build_object(
    'user_id', p_user_id,
    'delta', p_delta,
    'new_balance', new_bal
  );
end $$;

-- ---------------------------------------------------------------------
-- 6f. Submit withdraw — atomic deduct balance + insert pending tx
-- ---------------------------------------------------------------------
create or replace function public.submit_withdraw_request(p_amount integer)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  bal integer;
  tx_id bigint;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_amount <= 0 then raise exception 'amount must be positive'; end if;
  if p_amount > 1000000000 then raise exception 'amount exceeds per-withdrawal limit'; end if;

  -- Lock row, check balance, deduct atomically
  select balance_points into bal from public.profiles where id = uid for update;
  if bal is null then raise exception 'profile not found'; end if;
  if bal < p_amount then raise exception 'insufficient balance'; end if;

  update public.profiles
    set balance_points = balance_points - p_amount
    where id = uid;

  insert into public.transactions (user_id, type, amount, status)
  values (uid, 'withdraw', p_amount, 'pending')
  returning id into tx_id;

  return tx_id;
end $$;

-- ---------------------------------------------------------------------
-- 6g. Override approve_transaction để khớp model trừ-ngay
--     - deposit: approve → cộng balance ; reject → no-op
--     - withdraw: balance đã trừ lúc submit
--                 approve → mark success (giữ trừ)
--                 reject  → REFUND balance, mark cancelled
-- ---------------------------------------------------------------------
create or replace function public.approve_transaction(p_tx_id bigint, p_approve boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  tx public.transactions;
begin
  if not public.is_admin(auth.uid()) then raise exception 'forbidden'; end if;

  select * into tx from public.transactions where id = p_tx_id for update;
  if tx is null then raise exception 'transaction not found'; end if;
  if tx.status <> 'pending' then raise exception 'transaction already processed'; end if;

  if not p_approve then
    -- Reject
    if tx.type = 'withdraw' then
      -- Refund vì user đã bị trừ lúc submit
      update public.profiles
        set balance_points = balance_points + tx.amount
        where id = tx.user_id;
    end if;
    update public.transactions set status = 'cancelled' where id = p_tx_id;
    return jsonb_build_object('id', p_tx_id, 'type', tx.type, 'amount', tx.amount, 'status', 'cancelled');
  end if;

  -- Approve
  if tx.type = 'deposit' then
    update public.profiles
      set balance_points = balance_points + tx.amount
      where id = tx.user_id;
  end if;
  -- withdraw approve: không cần trừ thêm (đã trừ lúc submit)

  update public.transactions set status = 'success' where id = p_tx_id;
  return jsonb_build_object('id', p_tx_id, 'type', tx.type, 'amount', tx.amount, 'status', 'success');
end $$;

-- ---------------------------------------------------------------------
-- 6h. Quick place bet — auto-create round nếu chưa có, atomic deduct
-- ---------------------------------------------------------------------
create or replace function public.quick_place_bet(
  p_vote_type integer,
  p_choice text,
  p_amount integer
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  r public.vote_rounds;
  bal integer;
  bet_id bigint;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_amount <= 0 then raise exception 'amount must be positive'; end if;
  if p_vote_type not in (1, 2, 3) then raise exception 'invalid vote_type'; end if;

  -- Get latest open round for this vote_type, or create one
  select * into r from public.vote_rounds
    where vote_type = p_vote_type and status = 'open'
    order by open_at desc limit 1;

  if r.id is null then
    insert into public.vote_rounds (vote_type, round_no, status, multiplier)
    values (
      p_vote_type,
      to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYYYMMDDHH24MISS')
        || '-' || lpad(floor(random() * 10000)::text, 4, '0'),
      'open',
      2.0
    )
    returning * into r;
  end if;

  -- Check balance & deduct atomically
  select balance_points into bal from public.profiles where id = uid for update;
  if bal is null then raise exception 'profile not found'; end if;
  if bal < p_amount then raise exception 'insufficient balance'; end if;

  update public.profiles set balance_points = balance_points - p_amount where id = uid;

  insert into public.vote_history (user_id, round_id, vote_type, choice, amount, status, is_secret)
  values (uid, r.id, r.vote_type, p_choice, p_amount, 'pending', true)
  returning id into bet_id;

  return bet_id;
end $$;

-- ---------------------------------------------------------------------
-- 6i. Freeze account — admin có thể đóng băng user
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists is_frozen boolean not null default false;

-- Override place_bet để check frozen
create or replace function public.place_bet(p_round_id bigint, p_choice text, p_amount integer)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  r public.vote_rounds;
  bal integer;
  frozen boolean;
  bet_id bigint;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_amount <= 0 then raise exception 'amount must be positive'; end if;

  select * into r from public.vote_rounds where id = p_round_id;
  if r is null then raise exception 'round not found'; end if;
  if r.status <> 'open' then raise exception 'round closed'; end if;

  select balance_points, is_frozen into bal, frozen from public.profiles where id = uid for update;
  if frozen then raise exception 'account frozen — liên hệ CSKH'; end if;
  if bal < p_amount then raise exception 'insufficient balance'; end if;

  update public.profiles set balance_points = balance_points - p_amount where id = uid;
  insert into public.vote_history (user_id, round_id, vote_type, choice, amount, status, is_secret)
  values (uid, p_round_id, r.vote_type, p_choice, p_amount, 'pending', true)
  returning id into bet_id;
  return bet_id;
end $$;

-- Override quick_place_bet để check frozen
create or replace function public.quick_place_bet(
  p_vote_type integer, p_choice text, p_amount integer
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  r public.vote_rounds;
  bal integer;
  frozen boolean;
  bet_id bigint;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_amount <= 0 then raise exception 'amount must be positive'; end if;
  if p_vote_type not in (1, 2, 3) then raise exception 'invalid vote_type'; end if;

  select balance_points, is_frozen into bal, frozen from public.profiles where id = uid for update;
  if frozen then raise exception 'account frozen — liên hệ CSKH'; end if;
  if bal < p_amount then raise exception 'insufficient balance'; end if;

  select * into r from public.vote_rounds
    where vote_type = p_vote_type and status = 'open'
    order by open_at desc limit 1;

  if r.id is null then
    insert into public.vote_rounds (vote_type, round_no, status, multiplier)
    values (p_vote_type,
      to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYYYMMDDHH24MISS')
        || '-' || lpad(floor(random() * 10000)::text, 4, '0'),
      'open', 2.0)
    returning * into r;
  end if;

  update public.profiles set balance_points = balance_points - p_amount where id = uid;
  insert into public.vote_history (user_id, round_id, vote_type, choice, amount, status, is_secret)
  values (uid, r.id, r.vote_type, p_choice, p_amount, 'pending', true)
  returning id into bet_id;
  return bet_id;
end $$;

-- Override submit_withdraw_request để check frozen
create or replace function public.submit_withdraw_request(p_amount integer)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  bal integer;
  frozen boolean;
  tx_id bigint;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if p_amount <= 0 then raise exception 'amount must be positive'; end if;
  if p_amount > 1000000000 then raise exception 'amount exceeds per-withdrawal limit'; end if;
  select balance_points, is_frozen into bal, frozen from public.profiles where id = uid for update;
  if frozen then raise exception 'account frozen — liên hệ CSKH'; end if;
  if bal is null then raise exception 'profile not found'; end if;
  if bal < p_amount then raise exception 'insufficient balance'; end if;
  update public.profiles set balance_points = balance_points - p_amount where id = uid;
  insert into public.transactions (user_id, type, amount, status)
  values (uid, 'withdraw', p_amount, 'pending') returning id into tx_id;
  return tx_id;
end $$;

-- ---------------------------------------------------------------------
-- 7. Admin view: bet summary per round
-- ---------------------------------------------------------------------
create or replace view public.vote_round_stats as
select
  r.id as round_id,
  r.vote_type,
  r.round_no,
  r.status,
  r.winning,
  r.multiplier,
  r.open_at,
  r.close_at,
  r.settle_at,
  count(b.id)            as bet_count,
  coalesce(sum(b.amount), 0)::integer as total_amount,
  count(distinct b.user_id) as unique_bettors,
  coalesce(sum(b.payout), 0)::integer as total_payout
from public.vote_rounds r
left join public.vote_history b on b.round_id = r.id
group by r.id;
