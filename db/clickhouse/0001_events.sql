-- Reef Command — OLAP side (ClickHouse Cloud).
-- One append-only event stream powers every visual. Postgres holds truth;
-- every consequential write there emits an event here. Full history is
-- retained (columnar compression makes it cheap), so any past week's report
-- is computable on demand — WoW/MoM is a window comparison, not a pipeline.

CREATE TABLE IF NOT EXISTS events (
  ts            DateTime64(3, 'UTC'),
  type          LowCardinality(String),   -- order_placed | bid_placed | … (see src/lib/datastore.ts)
  platform      LowCardinality(String),   -- auction | web | marketplace | system
  sku           LowCardinality(String) DEFAULT '',
  category      LowCardinality(String) DEFAULT '',   -- zoas|euphyllia|goni|mushroom|sps|other
  customer_id   UInt32 DEFAULT 0,
  order_id      String DEFAULT '',
  amount_cents  Int64  DEFAULT 0,
  meta          String DEFAULT '{}'       -- JSON payload
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(ts)
ORDER BY (type, ts);

-- ---------- materialized views: rollups updated on INSERT, not on cron ----------

-- live revenue / order flow per platform (drives metric_row + timeseries)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_revenue_hourly
ENGINE = SummingMergeTree
ORDER BY (hour, platform)
AS SELECT
  toStartOfHour(ts)  AS hour,
  platform,
  sum(amount_cents)  AS revenue_cents,
  count()            AS orders
FROM events
WHERE type = 'order_placed'
GROUP BY hour, platform;

-- six-category sales (drives the weekly report's product analysis)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_category_daily
ENGINE = SummingMergeTree
ORDER BY (day, category)
AS SELECT
  toDate(ts)                            AS day,
  category,
  sum(amount_cents)                     AS revenue_cents,
  sum(-JSONExtractInt(meta, 'delta'))   AS units
FROM events
WHERE type = 'inventory_move' AND JSONExtractString(meta, 'reason') = 'sale'
GROUP BY day, category;

-- per-customer daily spend (drives tiers, retention lenses, audience selection)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_customer_daily
ENGINE = SummingMergeTree
ORDER BY (day, customer_id)
AS SELECT
  toDate(ts)        AS day,
  customer_id,
  sum(amount_cents) AS spend_cents,
  count()           AS orders
FROM events
WHERE type = 'order_placed' AND customer_id > 0
GROUP BY day, customer_id;

-- ---------- reference queries (documentation; used by the DataStore impl) ----------

-- The weekly cycle funnel (Task 4): auction win → code issued → add-on redeemed,
-- within 72h, per customer. One query quantifies the store's core economic move.
--
--   SELECT level, count() AS customers FROM (
--     SELECT customer_id,
--            windowFunnel(259200)(toDateTime(ts),
--              type = 'auction_won',
--              type = 'discount_code_issued',
--              type = 'discount_code_redeemed') AS level
--     FROM events
--     WHERE ts >= {weekStart} AND ts < {weekEnd} AND customer_id > 0
--     GROUP BY customer_id
--   ) GROUP BY level ORDER BY level;

-- Return-customer rate, snapshot lens (≥2 lifetime orders ÷ paying customers):
--
--   SELECT
--     countIf(lifetime_orders >= 2) / count() AS repeat_rate
--   FROM (
--     SELECT customer_id, sum(orders) AS lifetime_orders
--     FROM mv_customer_daily
--     WHERE day <= {asOf}
--     GROUP BY customer_id
--   );

-- Weekly flow lens (this week's revenue: returning vs first-time customers):
--
--   WITH firsts AS (
--     SELECT customer_id, min(day) AS first_day
--     FROM mv_customer_daily GROUP BY customer_id
--   )
--   SELECT
--     sumIf(d.spend_cents, f.first_day <  {weekStart}) AS returning_cents,
--     sumIf(d.spend_cents, f.first_day >= {weekStart}) AS new_cents
--   FROM mv_customer_daily d
--   JOIN firsts f USING (customer_id)
--   WHERE d.day >= {weekStart} AND d.day < {weekEnd};

-- WoW / MoM deltas: run the same aggregate over (week-1) and (week-4) windows —
-- full history is in the stream, so no snapshot pipeline is required.
