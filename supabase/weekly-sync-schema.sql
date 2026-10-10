-- Device clients use only the authenticated weekly-sync Edge Function.
create table if not exists public.weekly_feedback_state (
  profile_id text primary key,
  state jsonb not null default '{}'::jsonb check (jsonb_typeof(state) = 'object'),
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);
alter table public.weekly_feedback_state enable row level security;
revoke all on public.weekly_feedback_state from public, anon, authenticated;
grant select, insert, update on public.weekly_feedback_state to service_role;
insert into public.weekly_feedback_state (profile_id) values ('default') on conflict do nothing;
