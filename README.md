# 🪸 Reef Command

**A chat agent where the answer is never a wall of text.** Two-sided chat for a
live coral e-commerce store: a merchant copilot and a customer concierge
sharing one live data plane — every response a chart, a heatmap, a verdict
card, or a one-click gated action.

Built for the ClickHouse × Trigger.dev Virtual Summer Hackathon 2026.

- **ClickHouse Cloud** — primary database: high-volume synthetic event stream
  (orders, auction bids, messages, inventory moves), materialized views
  powering every visual in real time.
- **Trigger.dev** — `chat.agent()` orchestration, scheduled event generators,
  gated background action tasks, Realtime streaming to the UI.
- **ClickHouse-managed Postgres** — OLTP truth (orders, inventory, approval
  cases); every approved action closes the OLTP→OLAP loop on screen.

All data is synthetic. Design: [docs/DESIGN.md](docs/DESIGN.md).

## Run

```bash
cp .env.example .env.local   # fill in ClickHouse / Trigger.dev / Anthropic
npm install
npm run dev
```

## License

MIT
