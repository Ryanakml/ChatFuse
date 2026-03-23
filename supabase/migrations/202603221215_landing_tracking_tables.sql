begin;

create extension if not exists "pgcrypto";

create table if not exists public.landing_sessions (
  id uuid primary key default gen_random_uuid(),
  session_key text not null unique,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  referrer text,
  user_agent text,
  events jsonb not null default '[]'::jsonb
);

create table if not exists public.whitelist_signups (
  id uuid primary key default gen_random_uuid(),
  session_key text references public.landing_sessions(session_key) on update cascade on delete set null,
  name text,
  email text,
  clinic_type text,
  submitted_at timestamptz not null default now()
);

create index if not exists idx_whitelist_signups_session_key on public.whitelist_signups(session_key);
create index if not exists idx_whitelist_signups_email on public.whitelist_signups(email);

grant select, insert, update on table public.landing_sessions to anon, authenticated;
grant insert on table public.whitelist_signups to anon, authenticated;

revoke delete on table public.landing_sessions from anon, authenticated;
revoke delete, update, select on table public.whitelist_signups from anon, authenticated;

commit;
