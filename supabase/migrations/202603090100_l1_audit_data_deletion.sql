-- Migration: L1 - Security Hardening
-- Adds: audit_events table (immutable, INSERT-only) and delete_user_data function
-- Timestamp: 202603090100

begin;

-- ============================================================
-- 1. audit_events — Immutable event trail
-- ============================================================
create table if not exists audit_events (
  id            uuid        primary key default gen_random_uuid(),
  actor_id      text        not null,
  actor_role    text        not null default 'system',
  action        text        not null,
  resource_type text        not null,
  resource_id   text,
  metadata      jsonb       not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

-- Index for fast lookups by actor and action
create index if not exists audit_events_actor_id_idx  on audit_events (actor_id);
create index if not exists audit_events_action_idx    on audit_events (action);
create index if not exists audit_events_created_at_idx on audit_events (created_at desc);

-- RLS: enable but allow service-role unrestricted access.
-- Application layer enforces: INSERT only (no UPDATE, no DELETE).
alter table audit_events enable row level security;

-- Service role can insert audit events
create policy "service_role_insert_audit"
  on audit_events
  for insert
  to service_role
  with check (true);

-- Service role can read audit events (for admin trail queries)
create policy "service_role_select_audit"
  on audit_events
  for select
  to service_role
  using (true);

-- No UPDATE policy → rows are effectively immutable
-- No DELETE policy → rows cannot be deleted

-- ============================================================
-- 2. delete_user_data — GDPR-style hard delete with audit record
-- ============================================================
create or replace function delete_user_data(
  target_user_id uuid,
  actor          text  default 'system',
  actor_role_val text  default 'admin'
)
returns jsonb
language plpgsql
security definer
as $$
declare
  deleted_messages       int := 0;
  deleted_agent_events   int := 0;
  deleted_tool_calls     int := 0;
  deleted_tickets        int := 0;
  deleted_conversations  int := 0;
  deleted_users          int := 0;
begin
  -- Validate user exists
  if not exists (select 1 from users where id = target_user_id) then
    raise exception 'User % not found', target_user_id;
  end if;

  -- Delete messages (via conversation FK)
  delete from messages
  where conversation_id in (
    select id from conversations where user_id = target_user_id
  );
  get diagnostics deleted_messages = row_count;

  -- Delete agent_events
  delete from agent_events
  where conversation_id in (
    select id from conversations where user_id = target_user_id
  );
  get diagnostics deleted_agent_events = row_count;

  -- Delete tool_calls
  delete from tool_calls
  where conversation_id in (
    select id from conversations where user_id = target_user_id
  );
  get diagnostics deleted_tool_calls = row_count;

  -- Delete tickets
  delete from tickets
  where conversation_id in (
    select id from conversations where user_id = target_user_id
  );
  get diagnostics deleted_tickets = row_count;

  -- Delete conversations
  delete from conversations where user_id = target_user_id;
  get diagnostics deleted_conversations = row_count;

  -- Delete user record
  delete from users where id = target_user_id;
  get diagnostics deleted_users = row_count;

  -- Audit record (always written, even if cascade deleted nothing)
  insert into audit_events (
    actor_id, actor_role, action, resource_type, resource_id, metadata
  ) values (
    actor,
    actor_role_val,
    'user.data_deleted',
    'user',
    target_user_id::text,
    jsonb_build_object(
      'deleted_users',         deleted_users,
      'deleted_conversations', deleted_conversations,
      'deleted_messages',      deleted_messages,
      'deleted_agent_events',  deleted_agent_events,
      'deleted_tool_calls',    deleted_tool_calls,
      'deleted_tickets',       deleted_tickets
    )
  );

  return jsonb_build_object(
    'success',               true,
    'deleted_users',         deleted_users,
    'deleted_conversations', deleted_conversations,
    'deleted_messages',      deleted_messages,
    'deleted_agent_events',  deleted_agent_events,
    'deleted_tool_calls',    deleted_tool_calls,
    'deleted_tickets',       deleted_tickets
  );
end;
$$;

commit;
