# ChatFuse

## Local infrastructure

Prerequisites:

- Docker Desktop (or Docker Engine)
- `psql` available on your PATH for DB seeds

One-command local infra startup (Redis, optional OTEL, and seeds if `DATABASE_URL` is set):

```bash
./scripts/local-dev-up.sh
```

Enable the local OTEL collector (optional):

```bash
ENABLE_OTEL=1 ./scripts/local-dev-up.sh
```

Run DB seeds manually:

```bash
DATABASE_URL="postgres://user:pass@localhost:5432/postgres" ./scripts/seed-local-db.sh
```

Shutdown local infra:

```bash
./scripts/local-dev-down.sh
```
