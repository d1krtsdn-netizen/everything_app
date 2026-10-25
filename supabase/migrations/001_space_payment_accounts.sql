create table if not exists public.space_payment_accounts (
  id         uuid primary key default gen_random_uuid(),
  space_id   uuid not null references public.spaces(id) on delete cascade,
  account    text not null check (btrim(account) <> ''),
  owner      text not null check (btrim(owner) <> ''),
  created_by uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now()
);

create unique index if not exists space_payment_accounts_name_idx
  on public.space_payment_accounts (space_id, lower(account), lower(owner));

alter table public.space_payment_accounts enable row level security;

create policy "payment accounts: members read" on public.space_payment_accounts
  for select using (public.is_member(space_id));
create policy "payment accounts: editors create" on public.space_payment_accounts
  for insert with check (public.can_edit(space_id) and created_by = auth.uid());
create policy "payment accounts: editors delete" on public.space_payment_accounts
  for delete using (public.can_edit(space_id));
