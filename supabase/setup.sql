-- Friendsgiving: run this once in Supabase → SQL Editor → New query → Run.
-- Safe to run again; it only creates what's missing.

create table if not exists public.fg_rsvps (
  id          text primary key,
  name        text not null,
  status      text not null check (status in ('yes', 'maybe', 'no')),
  party       int  not null default 1 check (party between 1 and 9),
  times       text[] not null default '{}',   -- start-time ids: 12, 13, 14, 15, 16
  cat         text not null default '',       -- main, side, dessert, app, drink, supply
  dish        text not null default '',
  diet        text not null default '',
  secret_hash text not null,                  -- lets only the guest's own browser edit the row
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.fg_event (
  id         int primary key default 1 check (id = 1),   -- a single row of event settings
  time       text not null default '13',
  dinner     text not null default '',
  address    text not null default '',
  note       text not null default '',
  final      boolean not null default false,             -- true once the host sends the invite
  updated_at timestamptz not null default now()
);

-- Lock both tables to the website's server. With row level security on and no policies,
-- the public (anon) key can't read or write them; the server uses the service role key.
alter table public.fg_rsvps enable row level security;
alter table public.fg_event enable row level security;

-- A handy view for reading RSVPs in the Table Editor.
create or replace view public.fg_guest_list with (security_invoker = true) as
select name, status, party, array_to_string(times, ', ') as times, cat, dish, diet, created_at, updated_at
from public.fg_rsvps
order by created_at;
