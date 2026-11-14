# Tracely TypeScript SDK

Not built yet. It is the next SDK on the [roadmap](../../docs/latest/roadmap.mdx).

Until then, TypeScript and JavaScript apps can send data with the standard OpenTelemetry SDK, because Tracely accepts OTLP over HTTP:

```ts
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";

new NodeSDK({
  serviceName: "my-app",
  traceExporter: new OTLPTraceExporter({
    url: "http://localhost:3000/v1/traces",
    headers: { Authorization: `Bearer ${process.env.TRACELY_API_KEY}` },
  }),
}).start();
```

Set the GenAI attributes listed in [Concepts](../../docs/latest/concepts.mdx) on your spans and they appear in Tracely like SDK spans do.
