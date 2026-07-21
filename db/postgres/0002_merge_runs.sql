-- Durable outbox/idempotency state for synthetic ReefnBid + add-on merges.
-- Postgres owns the merge decision; ClickHouse delivery can retry safely.

CREATE TABLE IF NOT EXISTS merge_runs (
  merge_code       TEXT PRIMARY KEY,
  week_index       INTEGER NOT NULL,
  customer_id      BIGINT NOT NULL REFERENCES customers(id),
  anchor_order_id  TEXT NOT NULL,
  addon_order_ids  TEXT[] NOT NULL,
  source_order_ids TEXT[] NOT NULL,
  coral_units      INTEGER NOT NULL,
  total_cents      BIGINT NOT NULL,
  shipment_id      BIGINT NOT NULL REFERENCES shipments(id),
  status           TEXT NOT NULL DEFAULT 'pending_event'
                   CHECK (status IN ('pending_event','emitting','completed')),
  approved_by      TEXT NOT NULL,
  last_error       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_merge_runs_status ON merge_runs (status, updated_at);
CREATE INDEX IF NOT EXISTS idx_merge_runs_customer_week ON merge_runs (customer_id, week_index);
