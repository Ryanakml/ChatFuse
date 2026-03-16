# WA Chat — AI-Native WhatsApp Support Ops

## 1. Project Title & Catchy Description

**WA Chat** is a production-minded WhatsApp support platform that turns raw inbound webhook traffic into reliable, auditable, AI-assisted customer conversations. It combines fast webhook ACKs, Redis/BullMQ async processing, LangChain orchestration, Supabase persistence, and an operator dashboard for human takeover/escalation. The core problem it solves is simple: ship a WhatsApp AI support workflow that is resilient under retries/failures and still operationally manageable by a support team.

## 2. 🛠 Tech Stack

| Layer               | Technologies actually used in code                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------- |
| Frontend            | Next.js 16 (App Router), React 19, Tailwind CSS 4, Supabase SSR auth                              |
| Backend API         | Node.js + Express 5 (`apps/api`), JWT auth via Supabase, role middleware                          |
| Worker/Async        | BullMQ + Redis (`apps/worker`), retry/backoff/error classification, DLQ + replay CLI              |
| AI Orchestration    | LangChain pipeline (`packages/llm`), OpenAI primary + Gemini fallback, structured outputs via Zod |
| Routing/Classifiers | Groq classifier path (`llama-3.3-70b-versatile`) with keyword fallback                            |
| Database            | Supabase Postgres, pgvector, SQL migrations in `supabase/migrations`                              |
| RAG                 | Supabase vector store (`knowledge_chunks`), OpenAI embeddings primary + Gemini embedding fallback |
| Observability       | OpenTelemetry SDK, Prometheus alert rules, Grafana dashboards, runbooks in `docs/runbooks`        |
| CI/CD               | GitHub Actions (CI gates, staging deploy, production canary/rollback workflows)                   |

## 3. 🧠 Architecture & Data Flow

### High-level runtime flow

1. User sends a WhatsApp message.
2. Meta forwards the event to `POST /webhook` in `apps/api/src/index.ts`.
3. API verifies signature (`x-hub-signature-256`), enforces payload/rate constraints, builds a deterministic event key, and checks idempotency in Redis.
4. New events are enqueued to BullMQ (`wa-webhook-ingress`), duplicates are ACKed and skipped.
5. Worker consumes queue jobs (`apps/worker/src/queue/consumer.ts`) with timeout + retry policies.
6. Worker extracts inbound message payload, upserts user/conversation, and stores inbound message to Supabase.
7. Worker runs the LangChain pipeline (`packages/llm/src/langchain/pipeline.ts`): normalization → retrieval → classification → confidence → routing → tool execution → composition → policy.
8. Pipeline chooses path (`rag_path`, `tool_path`, `clarification_path`, `escalation_path`) and composes a structured response with provider fallback behavior.
9. Worker sends outbound text via WhatsApp Cloud API and persists outbound message + agent events + tool call audit.
10. Dashboard reads conversations/escalations/KPIs via authenticated API endpoints (`/api/conversations`, `/api/kpis`) for operators/analysts.

### Monorepo module map (what each directory does)

| Path                        | Responsibility                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `apps/api`                  | Ingress API, webhook verification/idempotency/enqueue, admin/security endpoints, conversation and KPI routes |
| `apps/api/src/repositories` | Supabase access for conversations, KPIs, audit events, and data deletion                                     |
| `apps/worker`               | Queue worker runtime, message processing, LangChain invocation, outbound sending, DLQ routing/replay         |
| `apps/dashboard`            | Operator UI (login, conversation timeline, manual takeover/return, escalation inbox, KPI dashboard)          |
| `packages/llm`              | LangChain orchestration, provider adapters, tool schemas/reliability, RAG ingestion/retrieval, eval runner   |
| `packages/shared`           | Cross-service contracts, queue payload schemas, metrics/telemetry/logger, PII masking, roles                 |
| `packages/config`           | Shared env contract + worker retry policy parsing/validation                                                 |
| `supabase/migrations`       | Core schema + indexes + RBAC + escalation fields + audit/deletion + `match_knowledge_chunks` RPC             |
| `scripts`                   | Infra up/down, seed, smoke/canary checks, migration guard, alert simulation                                  |
| `docs`                      | Architecture, ADRs, ticketed implementation history, runbooks, production plan                               |

### Data model (implemented)

Main tables: `users`, `conversations`, `messages`, `agent_events`, `tool_calls`, `tickets`, `knowledge_documents`, `knowledge_chunks`, `user_roles`, `audit_events`.

### Reality check from current code

- Webhook security, idempotency, queueing, worker retries/DLQ, RAG wiring, and dashboard ops flows are implemented.
- Business tool handlers currently return mocked domain responses (see TODOs in `packages/llm/src/tools/index.ts`) but are fully schema-validated and reliability-wrapped.

## 4. 🚀 End-to-End Local Setup (Idiot-Proof Tutorial) that really really works

### Prerequisites

- Node.js 20 LTS (recommended)
- npm 10+
- Docker Desktop (or Docker Engine)
- `psql` CLI (for applying SQL migrations)
- A Supabase project (cloud or local) with:
  - project URL
  - `service_role` key
  - `anon` key (for dashboard login)
- WhatsApp Cloud API credentials for full real outbound testing:
  - `WHATSAPP_APP_SECRET`
  - `WHATSAPP_VERIFY_TOKEN`
  - `WHATSAPP_PHONE_NUMBER_ID`
  - `WHATSAPP_ACCESS_TOKEN`

### Step 1 — Clone and install

```bash
git clone <your-repo-url>
cd wa-chat
npm ci
```

### Step 2 — Apply database migrations

Set your Postgres connection string first:

```bash
export DATABASE_URL="postgresql://postgres:<PASSWORD>@db.<PROJECT_REF>.supabase.co:5432/postgres?sslmode=require"
```

Apply every migration in order:

```bash
for f in supabase/migrations/*.sql; do
  echo "Applying $f"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
done
```

### Step 3 — Create env files (template based on real code)

#### `apps/api/.env`

```bash
cat > apps/api/.env <<'ENV'
NODE_ENV=development
PORT=3001

WHATSAPP_VERIFY_TOKEN=replace-me
WHATSAPP_APP_SECRET=replace-me
WHATSAPP_PHONE_NUMBER_ID=replace-me
WHATSAPP_ACCESS_TOKEN=replace-me

OPENAI_API_KEY=replace-me
GEMINI_API_KEY=replace-me

SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=replace-me
REDIS_URL=redis://localhost:6379

OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_SERVICE_NAME=wa-chat-api

# Optional runtime controls
ALLOW_INSECURE_HTTP=true
TRUST_PROXY=false
WEBHOOK_IDEMPOTENCY_TTL_SECONDS=86400
WEBHOOK_BODY_LIMIT=256kb
WEBHOOK_RATE_LIMIT_WINDOW_MS=60000
WEBHOOK_RATE_LIMIT_MAX=120
ADMIN_IP_ALLOWLIST=
ADMIN_RATE_LIMIT_WINDOW_MS=60000
ADMIN_RATE_LIMIT_MAX=30
ADMIN_AUTH_HEADER=x-wa-user
ADMIN_ROLE_HEADER=x-wa-role
ADMIN_ALLOWED_ROLES=admin
LANGCHAIN_TRACING_V2=
LANGCHAIN_API_KEY=
ENV
```

#### `apps/worker/.env`

```bash
cat > apps/worker/.env <<'ENV'
NODE_ENV=development
PORT=3002

WHATSAPP_VERIFY_TOKEN=replace-me
WHATSAPP_APP_SECRET=replace-me
WHATSAPP_PHONE_NUMBER_ID=replace-me
WHATSAPP_ACCESS_TOKEN=replace-me

OPENAI_API_KEY=replace-me
GEMINI_API_KEY=replace-me
# Optional environment fallbacks used by worker/LLM router
STAGING_OPENAI_API_KEY=
STAGING_GEMINI_API_KEY=
PROD_OPENAI_API_KEY=
PROD_GEMINI_API_KEY=
GROQ_API_KEY=
GROQ_BASE_URL=https://api.groq.com/openai/v1
GROQ_ROUTER_MODEL=llama-3.3-70b-versatile
GROQ_ROUTER_TIMEOUT_MS=2000
RAG_CONFIDENCE_THRESHOLD=0.7

SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=replace-me
REDIS_URL=redis://localhost:6379

OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_SERVICE_NAME=wa-chat-worker

WORKER_CONCURRENCY=10
WORKER_JOB_TIMEOUT_MS=30000
WORKER_RETRY_TRANSIENT_MAX_ATTEMPTS=5
WORKER_RETRY_PERMANENT_MAX_ATTEMPTS=1
WORKER_RETRY_BACKOFF_DELAY_MS=1000
WORKER_RETRY_BACKOFF_JITTER=0.2
LANGCHAIN_TRACING_V2=
LANGCHAIN_API_KEY=
ENV
```

#### `apps/dashboard/.env`

```bash
cat > apps/dashboard/.env <<'ENV'
NODE_ENV=development

API_URL=http://localhost:3001
NEXT_PUBLIC_API_URL=http://localhost:3001

NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=replace-me
ENV
```

### Step 4 — Start local infra (Redis, optional OTEL/Grafana)

```bash
npm run dev:infra
```

If you want OTEL + Prometheus + Grafana too:

```bash
ENABLE_OTEL=1 npm run dev:infra
```

Note: OTEL profile maps Grafana to `localhost:3000`, which conflicts with dashboard default port. If OTEL is enabled, run dashboard on another port (example below).

### Step 5 — Seed RAG knowledge base (optional but recommended)

`seed:knowledge` reads root env values. Export once in terminal:

```bash
export SUPABASE_URL=https://<project-ref>.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=replace-me
export OPENAI_API_KEY=replace-me
npm run seed:knowledge
```

### Step 6 — Start services (separate terminals)

Terminal A (API):

```bash
npm run dev:api
```

Terminal B (Worker):

```bash
npm --workspace apps/worker run dev
```

Terminal C (Dashboard):

```bash
npm run dev:dashboard
```

If OTEL profile is enabled and port `3000` is taken by Grafana:

```bash
npm --workspace apps/dashboard run dev -- --port 3002
```

### Step 7 — Quick sanity checks

```bash
curl http://localhost:3001/health
curl http://localhost:3001/ready
curl "http://localhost:3001/webhook?hub.mode=subscribe&hub.verify_token=<WHATSAPP_VERIFY_TOKEN>&hub.challenge=12345"
```

Dashboard login page:

- `http://localhost:3000/login` (or `http://localhost:3002/login` if you changed port)

Before using dashboard role-gated pages, assign a role in Supabase:

```sql
insert into public.user_roles (user_id, role)
values ('<auth_user_uuid>', 'admin');
```

### Step 8 — Stop local infra when done

```bash
npm run dev:infra:down
```

## 5. 📜 Usage / API Endpoints (If applicable)

### 1) Webhook verification (Meta handshake)

```bash
curl "http://localhost:3001/webhook?hub.mode=subscribe&hub.verify_token=<WHATSAPP_VERIFY_TOKEN>&hub.challenge=test-challenge"
```

### 2) Inbound webhook event (signed)

```bash
BODY='{"object":"whatsapp_business_account"}'
SIG=$(node -e "const c=require('crypto');const b=process.argv[1];const s=process.argv[2];process.stdout.write('sha256='+c.createHmac('sha256',s).update(b).digest('hex'));" "$BODY" "$WHATSAPP_APP_SECRET")

curl -X POST http://localhost:3001/webhook \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: $SIG" \
  -d "$BODY"
```

### 3) Operator/analytics APIs (JWT required)

```bash
# support_agent role
curl -H "Authorization: Bearer <SUPABASE_JWT>" \
  http://localhost:3001/api/conversations

# analyst or admin role
curl -H "Authorization: Bearer <SUPABASE_JWT>" \
  http://localhost:3001/api/kpis

# conversation timeline
curl -H "Authorization: Bearer <SUPABASE_JWT>" \
  http://localhost:3001/api/conversations/<conversation_id>/timeline
```

### Bonus: DLQ replay command (guardrailed)

```bash
npm --workspace apps/worker run dlq:replay -- \
  --job-id=<DLQ_JOB_ID> \
  --actor=ops-user \
  --reason="incident-1234 fix applied" \
  --execute \
  --confirm=REPLAY_DLQ
```
