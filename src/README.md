# Platform source

| Path | What it is |
|---|---|
| [`client/`](client/) | The Tracely application: dashboard, OTLP ingest endpoint, REST API, and alert evaluator, in one Next.js app |

Inside `client/src`:

| Path | Contents |
|---|---|
| `app/(app)/` | Dashboard pages and their server actions |
| `app/(auth)/` | Sign-in and first-run setup |
| `app/api/` | `otlp/v1/traces` (ingest), `v1/prompts`, `cron/evaluate`, `health` |
| `clickhouse/schema.ts` | Telemetry schema, applied on first use |
| `lib/otlp.ts` | OTLP decoding (JSON and protobuf) and span normalisation |
| `lib/queries.ts` | Analytics queries |
| `lib/anomalies.ts`, `lib/optimizer.ts`, `lib/budgets.ts`, `lib/alerts.ts` | The features their names say |
| `lib/db.ts` | SQLite store for users, keys, budgets, channels, prompts |
| `components/` | Shell, charts, waterfall, session replay |
| `constants/pricing.json` | Model price list |
