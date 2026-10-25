-- =====================================================================
-- EVERYTHING APP – database schema
-- Run ONCE in Supabase → SQL Editor → New query → paste → Run.
-- Future database changes go in new files: supabase/migrations/NNN_name.sql
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Tables ----------------------------------------------------

-- One row per user (created automatically on sign-up)
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  display_name text,
  share_token  text unique default encode(gen_random_bytes(18), 'hex'),  -- used by the iOS Shortcut
  created_at   timestamptz default now()
);

-- A "space" is a category (Events, Tasks, Shopping, or any future type)
create table if not exists public.spaces (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  type       text not null,          -- matches a file in js/types/ (events, todo, shopping, list…)
  icon       text,
  owner_id   uuid not null references auth.users(id) on delete cascade default auth.uid(),
  sort       int default 0,
  created_at timestamptz default now()
);

-- Who can see a space and what they can do
create table if not exists public.space_members (
  space_id   uuid references public.spaces(id) on delete cascade,
  user_id    uuid references public.profiles(id) on delete cascade,
  role       text not null default 'editor' check (role in ('owner','editor','viewer')),
  created_at timestamptz default now(),
  primary key (space_id, user_id)
);

-- Pending invitations (accepted automatically when that email signs in)
create table if not exists public.invites (
  id         uuid primary key default gen_random_uuid(),
  space_id   uuid references public.spaces(id) on delete cascade,
  email      text not null,
  role       text not null default 'editor' check (role in ('editor','viewer')),
  invited_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz default now(),
  unique (space_id, email)
);

-- Every entry in every category. Type-specific fields live in "data" (JSON),
-- so new categories never need new tables.
create table if not exists public.items (
  id             uuid primary key default gen_random_uuid(),
  space_id       uuid not null references public.spaces(id) on delete cascade,
  title          text not null default '',
  status         text,
  due_at         timestamptz,                 -- event date / deadline
  remind_at      timestamptz,                 -- when to send a push notification
  remind_user_id uuid references auth.users(id) on delete set null,
  reminded       boolean not null default false,
  data           jsonb not null default '{}'::jsonb,
  sort           double precision default 0,
  created_by     uuid references auth.users(id) on delete set null default auth.uid(),
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);
create index if not exists items_space_idx on public.items(space_id);
create index if not exists items_remind_idx on public.items(remind_at) where reminded = false;

-- Devices that receive push notifications
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade default auth.uid(),
  endpoint   text unique not null,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz default now()
);

-- ---------- Helper functions (used by security rules) -----------------

create or replace function public.is_member(sid uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from space_members where space_id = sid and user_id = auth.uid());
$$;

create or replace function public.can_edit(sid uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from space_members where space_id = sid and user_id = auth.uid() and role in ('owner','editor'));
$$;

create or replace function public.is_owner(sid uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from space_members where space_id = sid and user_id = auth.uid() and role = 'owner');
$$;

create or replace function public.shares_space_with(other uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from space_members a join space_members b on a.space_id = b.space_id
    where a.user_id = auth.uid() and b.user_id = other);
$$;

-- Accept all pending invites for the signed-in user's email
create or replace function public.accept_invites() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into space_members (space_id, user_id, role)
    select space_id, auth.uid(), role from invites
    where lower(email) = lower(auth.jwt() ->> 'email')
  on conflict do nothing;
  get diagnostics n = row_count;
  delete from invites where lower(email) = lower(auth.jwt() ->> 'email');
  return n;
end $$;

-- ---------- Triggers --------------------------------------------------

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, display_name)
  values (new.id, new.email, split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for users that already exist
insert into public.profiles (id, email, display_name)
select id, email, split_part(email, '@', 1) from auth.users
on conflict (id) do nothing;

create or replace function public.handle_new_space() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into space_members (space_id, user_id, role) values (new.id, new.owner_id, 'owner')
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists on_space_created on public.spaces;
create trigger on_space_created after insert on public.spaces
  for each row execute function public.handle_new_space();

create or replace function public.items_before_update() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  if new.remind_at is distinct from old.remind_at then new.reminded = false; end if;
  return new;
end $$;
drop trigger if exists items_touch on public.items;
create trigger items_touch before update on public.items
  for each row execute function public.items_before_update();

-- ---------- Row Level Security (who can see / change what) ------------

alter table public.profiles           enable row level security;
alter table public.spaces             enable row level security;
alter table public.space_members      enable row level security;
alter table public.invites            enable row level security;
alter table public.items              enable row level security;
alter table public.push_subscriptions enable row level security;

create policy "profiles: read self and people I share with" on public.profiles
  for select using (id = auth.uid() or public.shares_space_with(id));
create policy "profiles: update self" on public.profiles
  for update using (id = auth.uid());

create policy "spaces: read" on public.spaces
  for select using (owner_id = auth.uid() or public.is_member(id));
create policy "spaces: create" on public.spaces
  for insert with check (owner_id = auth.uid());
create policy "spaces: update (owner)" on public.spaces
  for update using (public.is_owner(id));
create policy "spaces: delete (owner)" on public.spaces
  for delete using (public.is_owner(id));

create policy "members: read" on public.space_members
  for select using (public.is_member(space_id));
create policy "members: owner manages" on public.space_members
  for all using (public.is_owner(space_id)) with check (public.is_owner(space_id));
create policy "members: leave" on public.space_members
  for delete using (user_id = auth.uid() and role <> 'owner');

create policy "invites: owner manages" on public.invites
  for all using (public.is_owner(space_id)) with check (public.is_owner(space_id));

create policy "items: read" on public.items
  for select using (public.is_member(space_id));
create policy "items: create" on public.items
  for insert with check (public.can_edit(space_id));
create policy "items: update" on public.items
  for update using (public.can_edit(space_id)) with check (public.can_edit(space_id));
create policy "items: delete" on public.items
  for delete using (public.can_edit(space_id));

create policy "push: own devices" on public.push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- Live updates (shared lists refresh instantly) -------------
alter publication supabase_realtime add table public.items;
