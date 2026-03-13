begin;

create or replace function public.match_knowledge_chunks(
  query_embedding vector(1536),
  match_count int default 4,
  filter jsonb default '{}'::jsonb
)
returns table (
  id uuid,
  document_id uuid,
  chunk_index integer,
  content text,
  metadata jsonb,
  similarity double precision
)
language sql
stable
as $$
  select
    kc.id,
    kc.document_id,
    kc.chunk_index,
    kc.content,
    kc.metadata,
    1 - (kc.embedding <=> query_embedding) as similarity
  from public.knowledge_chunks as kc
  where (
    filter = '{}'::jsonb
    or kc.metadata @> filter
  )
  order by kc.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

commit;
