#!/usr/bin/env bash
# Run Tracely locally without Docker: a chDB-backed ClickHouse stand-in plus the dashboard in dev mode.
# Requires Node 22+ and `pip install chdb`. For real deployments use docker-compose.yml.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .tracely-dev
python3 scripts/dev-clickhouse.py --port 8123 --path .tracely-dev/clickhouse &
CH_PID=$!
trap 'kill $CH_PID 2>/dev/null || true' EXIT
cd src/client
[ -d node_modules ] || npm install
TRACELY_DATA_DIR="$(pwd)/../../.tracely-dev/data" npm run dev
