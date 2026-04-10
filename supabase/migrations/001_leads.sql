create type lead_source as enum ('kijiji', 'facebook');
create type lead_status as enum ('new', 'contacted', 'closed', 'not_relevant');

create table leads (
  id           uuid primary key default gen_random_uuid(),
  source       lead_source not null,
  title        text not null,
  body         text,
  url          text unique not null,
  posted_at    timestamptz,
  location     text,
  contact      text,
  status       lead_status not null default 'new',
  raw          jsonb,
  created_at   timestamptz not null default now()
);

-- Index for dashboard queries
create index leads_status_idx     on leads (status);
create index leads_source_idx     on leads (source);
create index leads_posted_at_idx  on leads (posted_at desc);
create index leads_created_at_idx on leads (created_at desc);

-- Enable RLS
alter table leads enable row level security;

-- Allow all operations for authenticated users (tighten later)
create policy "authenticated full access"
  on leads for all
  to authenticated
  using (true)
  with check (true);

-- Allow anon read so the dashboard works with the anon key during dev
create policy "anon read"
  on leads for select
  to anon
  using (true);
