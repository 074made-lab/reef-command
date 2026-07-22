-- CoralSeller — OLTP truth (ClickHouse-managed Postgres).
-- Transactional state lives here; every consequential write also emits an
-- event to ClickHouse (db/clickhouse/0001_events.sql) so analytics stays live.
-- Naming mirrors the owner's home CRM schema so migration is a seam swap.
-- Money is integer cents everywhere.

-- one row per real human (Task 1: customer 360)
CREATE TABLE IF NOT EXISTS customers (
  id                BIGSERIAL PRIMARY KEY,
  primary_email     TEXT,
  primary_phone     TEXT,                    -- E.164 normalized
  primary_name      TEXT,
  tier              SMALLINT NOT NULL DEFAULT 4 CHECK (tier BETWEEN 1 AND 4),
  preferences       JSONB NOT NULL DEFAULT '{}',   -- {categories: [], contact: "email"|"sms"|"both"}
  shipping_city     TEXT,
  total_orders      INTEGER NOT NULL DEFAULT 0,
  total_spent_cents BIGINT  NOT NULL DEFAULT 0,
  first_order_at    TIMESTAMPTZ,
  last_order_at     TIMESTAMPTZ,
  merge_confidence  REAL,                    -- lowest confidence merged into this row; low ⇒ review
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers (primary_email);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers (primary_phone);

-- one row per (platform, handle) — the cross-platform identity graph
CREATE TABLE IF NOT EXISTS customer_identities (
  id              BIGSERIAL PRIMARY KEY,
  customer_id     BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  platform        TEXT   NOT NULL CHECK (platform IN ('auction','web','marketplace')),
  external_handle TEXT   NOT NULL,
  external_email  TEXT,
  external_phone  TEXT,
  external_name   TEXT,
  match_confidence REAL  NOT NULL DEFAULT 1.0,  -- how this identity was attached
  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (platform, external_handle)
);
CREATE INDEX IF NOT EXISTS idx_identities_customer ON customer_identities (customer_id);
CREATE INDEX IF NOT EXISTS idx_identities_email    ON customer_identities (external_email);
CREATE INDEX IF NOT EXISTS idx_identities_phone    ON customer_identities (external_phone);

-- every order on every platform (idempotent by platform + external id)
CREATE TABLE IF NOT EXISTS orders (
  id               BIGSERIAL PRIMARY KEY,
  platform         TEXT   NOT NULL CHECK (platform IN ('auction','web','marketplace')),
  external_id      TEXT   NOT NULL,
  customer_id      BIGINT REFERENCES customers(id),
  identity_id      BIGINT REFERENCES customer_identities(id),
  status           TEXT   NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','paid','labeled','shipped','delivered','cancelled','held')),
  total_cents      BIGINT NOT NULL,
  shipping_cents   BIGINT NOT NULL DEFAULT 0,
  discount_code    TEXT,
  destination_city TEXT,
  address_suspect  BOOLEAN NOT NULL DEFAULT false,
  shipment_id      BIGINT,                   -- FK added below (shipments defined after)
  ordered_at       TIMESTAMPTZ NOT NULL,
  paid_at          TIMESTAMPTZ,
  cancelled_at     TIMESTAMPTZ,
  raw              JSONB NOT NULL DEFAULT '{}',
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (platform, external_id)
);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders (customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status   ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_ordered  ON orders (ordered_at);

CREATE TABLE IF NOT EXISTS order_items (
  id          BIGSERIAL PRIMARY KEY,
  order_id    BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  sku         TEXT   NOT NULL,
  name        TEXT   NOT NULL,
  category    TEXT   NOT NULL CHECK (category IN ('zoas','euphyllia','goni','mushroom','sps','other')),
  qty         INTEGER NOT NULL DEFAULT 1,
  price_cents BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_items_order ON order_items (order_id);

-- the combined physical box: one shipment bundles ≥1 orders for one customer
-- (Task 3 — this is what "combined order" resolves to at ship time)
CREATE TABLE IF NOT EXISTS shipments (
  id               BIGSERIAL PRIMARY KEY,
  shipment_code    TEXT   NOT NULL UNIQUE,          -- "SHP-30-4"
  customer_id      BIGINT NOT NULL REFERENCES customers(id),
  ship_week        TEXT   NOT NULL,                 -- "2026-W30"
  status           TEXT   NOT NULL DEFAULT 'planned'
                   CHECK (status IN ('planned','purchased','voided','shipped','delivered','held')),
  items            INTEGER NOT NULL DEFAULT 0,      -- coral count → weight
  weight_lb        NUMERIC(6,2),
  destination_city TEXT,
  pack             TEXT NOT NULL DEFAULT 'none' CHECK (pack IN ('none','heat','cold')),
  label_cost_cents BIGINT,
  purchased_at     TIMESTAMPTZ,
  voided_at        TIMESTAMPTZ,
  void_reason      TEXT,
  shipped_at       TIMESTAMPTZ,
  delivered_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_shipments_week ON shipments (ship_week, status);
ALTER TABLE orders ADD CONSTRAINT fk_orders_shipment
  FOREIGN KEY (shipment_id) REFERENCES shipments(id);

-- conversation log, both directions (Task 2 sends + Task 3.4 first responses)
CREATE TABLE IF NOT EXISTS messages (
  id          BIGSERIAL PRIMARY KEY,
  customer_id BIGINT REFERENCES customers(id),
  direction   TEXT NOT NULL CHECK (direction IN ('in','out')),
  platform    TEXT NOT NULL,
  intent      TEXT,                                -- 'doa_claim' | 'condition_concern' | 'thanks' | …
  template_id TEXT,                                -- codified template used, if any (out only)
  campaign_id TEXT,
  preview     TEXT NOT NULL,
  at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_messages_customer ON messages (customer_id, at);

-- pre-ship requests (Task 3.3)
CREATE TABLE IF NOT EXISTS requests (
  id           BIGSERIAL PRIMARY KEY,
  request_code TEXT NOT NULL UNIQUE,
  customer_id  BIGINT NOT NULL REFERENCES customers(id),
  kind         TEXT NOT NULL CHECK (kind IN ('cancel_ship','hold_next_week','address_change','late_addon','other')),
  detail       TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','auto_handled','resolved')),
  auto_actions TEXT[] NOT NULL DEFAULT '{}',       -- e.g. {'label_voided:SHP-30-4'}
  received_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at  TIMESTAMPTZ
);

-- approval cases (beyond-authority requests; money is always human)
CREATE TABLE IF NOT EXISTS cases (
  id          BIGSERIAL PRIMARY KEY,
  case_code   TEXT NOT NULL UNIQUE,
  kind        TEXT NOT NULL CHECK (kind IN ('doa_claim','refund_request','beyond_template','other')),
  customer_id BIGINT NOT NULL REFERENCES customers(id),
  order_id    BIGINT REFERENCES orders(id),
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','approved','rejected')),
  summary     TEXT NOT NULL,
  evidence    JSONB NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at  TIMESTAMPTZ,
  decided_by  TEXT                                  -- always a human identifier
);

-- campaign definitions + send log (Task 2; sends are simulated in the demo)
CREATE TABLE IF NOT EXISTS campaigns (
  id                BIGSERIAL PRIMARY KEY,
  campaign_code     TEXT NOT NULL UNIQUE,           -- "CMP-30-announce"
  phase             TEXT NOT NULL,                  -- announce|preview|reminder|live|winners
  audience_criteria TEXT NOT NULL,
  audience_count    INTEGER NOT NULL DEFAULT 0,
  preview           JSONB NOT NULL DEFAULT '{}',    -- {channel, subject, body}
  scheduled_at      TIMESTAMPTZ,
  approved_by       TEXT,                           -- gated: human click before send
  sent_at           TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS campaign_sends (
  id          BIGSERIAL PRIMARY KEY,
  campaign_id BIGINT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  customer_id BIGINT NOT NULL REFERENCES customers(id),
  channel     TEXT NOT NULL CHECK (channel IN ('email','sms')),
  simulated   BOOLEAN NOT NULL DEFAULT true,
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- every executed action, auto or gated — the audit trail
CREATE TABLE IF NOT EXISTS action_log (
  id          BIGSERIAL PRIMARY KEY,
  task_id     TEXT  NOT NULL,
  risk        TEXT  NOT NULL CHECK (risk IN ('auto','gated')),
  payload     JSONB NOT NULL DEFAULT '{}',
  approved_by TEXT,                                 -- required when risk = 'gated'
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  outcome     TEXT NOT NULL DEFAULT 'ok',
  error       TEXT
);

-- one compact snapshot per published weekly report (Task 4 audit + fast trends)
CREATE TABLE IF NOT EXISTS report_snapshots (
  id          BIGSERIAL PRIMARY KEY,
  week_label  TEXT NOT NULL UNIQUE,                 -- idempotent by week
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sections    JSONB NOT NULL
);
