# Examples

Each example is a single script. They need a running Tracely instance and an API key from **Settings**.

```bash
git clone https://github.com/mouryadwarapudii/tracely-python
pip install -e tracely-python      # run next to this repository
export TRACELY_API_KEY=tr_...
export TRACELY_ENDPOINT=http://localhost:3000
```

| Example | Shows | Also needs |
|---|---|---|
| `openai-chat-app` | Automatic tracing of OpenAI chat, including streaming | `pip install openai`, `OPENAI_API_KEY` |
| `anthropic-chat-app` | Automatic tracing of Anthropic messages | `pip install anthropic`, `ANTHROPIC_API_KEY` |
| `agent-session-app` | Sessions, `@tracely.agent`, `@tracely.tool`, and a prompt from the Prompt hub | `pip install openai`, `OPENAI_API_KEY` |
| `otel-only-app` | Sending spans with plain OpenTelemetry, no Tracely SDK | `pip install opentelemetry-sdk opentelemetry-exporter-otlp-proto-http` |

No provider key? `npm run seed` in `src/client` loads two weeks of demo data instead.
