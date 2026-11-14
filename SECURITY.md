# Security

## Reporting a vulnerability

Email the maintainers privately rather than opening a public issue. Include steps to reproduce and the affected version. Replace this paragraph with your security contact address before publishing.

## How Tracely handles sensitive data

- **Passwords** are hashed with scrypt and a per-user salt.
- **API keys** are shown once and stored as SHA-256 hashes.
- **Sessions** are signed, HTTP-only cookies. Set `TRACELY_SECRET` in production.
- **Prompts and responses** are stored in ClickHouse when the SDK captures content. Turn capture off with `capture_content=False` if your prompts contain data you do not want stored.
- **Alert webhooks** are called from the server with URLs an authenticated user entered. Run Tracely on a network where that is acceptable, or restrict egress.

## Deployment checklist

- Serve Tracely over HTTPS behind a reverse proxy.
- Set strong values for `TRACELY_SECRET` and `TRACELY_CLICKHOUSE_PASSWORD`.
- Do not expose ClickHouse ports publicly.
- Back up the `tracely-data` volume (accounts, keys, budgets, prompts) and the ClickHouse volume.
