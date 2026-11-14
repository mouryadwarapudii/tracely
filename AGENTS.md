# Notes for coding agents

Tracely is a monorepo. Read `README.md` for the layout and `CONTRIBUTING.md` for conventions before changing code.

- The app is `src/client` (Next.js 16 App Router, React 19, Tailwind 4). Request interception lives in `src/proxy.ts`, not `middleware.ts`. `params` and `searchParams` are promises.
- Telemetry is in ClickHouse (`src/client/src/clickhouse/schema.ts`); app metadata is in SQLite via `node:sqlite` (`src/client/src/lib/db.ts`).
- Pages are server components that query directly; charts and players are client components that receive data as props.
- Run `npm run typecheck && npm test` in `src/client` and `pytest sdk/python` after changes.
- Local ClickHouse without Docker: `python3 scripts/dev-clickhouse.py` (needs `pip install chdb`).
