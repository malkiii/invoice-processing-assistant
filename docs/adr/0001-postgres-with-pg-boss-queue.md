# PostgreSQL for data and job queue, no Redis

All app data lives in PostgreSQL (via Drizzle), and background Extractions run on pg-boss, a Postgres-backed queue, in a separate `worker` container built from the same image. We chose this over BullMQ + Redis so a self-hosted Docker deployment needs one stateful service fewer; Templates and Raw Values are stored as JSONB. Revisit only if queue throughput outgrows Postgres.
