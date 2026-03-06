begin;

create index if not exists users_phone_number_unique on users (phone_number);
create index if not exists conversations_user_status_created_at_idx on conversations (user_id, status, created_at);
create index if not exists messages_conversation_created_at_idx on messages (conversation_id, created_at);
create index if not exists agent_events_conversation_created_at_idx on agent_events (conversation_id, created_at);
create index if not exists tool_calls_conversation_status_idx on tool_calls (conversation_id, status);
create index if not exists tickets_status_created_at_idx on tickets (status, created_at);

commit;
