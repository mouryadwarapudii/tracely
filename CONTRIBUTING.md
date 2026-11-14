# Contributing

## Set up

Requirements: Node 22 or newer, Python 3.9 or newer.

```bash
pip install chdb
./scripts/dev.sh                    # ClickHouse stand-in on :8123, dashboard on :3000
pip install -e "sdk/python[dev]"
```

Create the owner account in the browser, create an API key under Settings, then load demo data with `TRACELY_API_KEY=tr_... npm run seed` from `src/client`.

## Before opening a pull request

```bash
cd src/client && npm run typecheck && npm test && npm run build
pytest sdk/python
```

## Conventions

- **SQL**: pass every user-supplied value as a bound parameter (`{name:Type}`). Never alias an aggregate with the name of a column (`sum(cost) AS cost`): ClickHouse resolves the alias inside `WHERE`, which breaks the query. Use a different name (`AS spend`).
- **Schema**: append statements to `src/client/src/clickhouse/schema.ts`. Do not edit ones already released.
- **Ingest**: new semantic-convention attributes are mapped in `src/client/src/lib/otlp.ts`, with a test in `src/__tests__`.
- **SDK**: instrumentation must never raise into the host application. Wrap telemetry code so a failure leaves the user's call untouched, and add a test that runs against the real client library.
- **UI copy**: sentence case, plain verbs, and buttons that say what they do.
- **Docs**: update `docs/latest` in the same pull request as the behaviour change.
