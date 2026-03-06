begin;

create extension if not exists "pgcrypto";
create extension if not exists "vector";

create table users (
  id uuid primary key default gen_random_uuid(),
  phone_number text not null,
  display_name text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_phone_number_unique unique (phone_number)
);

create table conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  status text not null default 'open',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  direction text not null,
  sender_type text not null,
  whatsapp_message_id text,
  body text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint messages_direction_check check (direction in ('inbound', 'outbound')),
  constraint messages_sender_type_check check (sender_type in ('user', 'agent', 'system', 'tool')),
  constraint messages_whatsapp_message_id_unique unique (whatsapp_message_id)
);

create table agent_events (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  message_id uuid references messages(id) on delete set null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table tool_calls (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  message_id uuid references messages(id) on delete set null,
  tool_name text not null,
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  constraint tool_calls_status_check check (status in ('pending', 'success', 'failed'))
);

create table tickets (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  external_ticket_id text,
  status text not null default 'open',
  priority text not null default 'normal',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tickets_status_check check (status in ('open', 'pending', 'closed', 'escalated')),
  constraint tickets_priority_check check (priority in ('low', 'normal', 'high', 'urgent'))
);

create table knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  title text,
  content text not null,
  version text not null default '1',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint knowledge_documents_source_version_unique unique (source, version)
);

create table knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references knowledge_documents(id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  embedding vector(1536) not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint knowledge_chunks_document_chunk_unique unique (document_id, chunk_index)
);

commit;
