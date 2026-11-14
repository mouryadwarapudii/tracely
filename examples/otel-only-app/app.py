"""Send spans with plain OpenTelemetry. Tracely reads the GenAI semantic conventions,
so any SDK or language that emits them works the same way."""
import os

from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

endpoint = os.environ.get("TRACELY_ENDPOINT", "http://localhost:3000")
provider = TracerProvider(resource=Resource.create({"service.name": "otel-only-app", "deployment.environment.name": "development"}))
provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(
    endpoint=f"{endpoint}/v1/traces",
    headers={"Authorization": f"Bearer {os.environ['TRACELY_API_KEY']}"},
)))
tracer = provider.get_tracer("example")

with tracer.start_as_current_span("chat gpt-4o-mini", kind=trace.SpanKind.CLIENT) as span:
    span.set_attributes({
        "gen_ai.operation.name": "chat",
        "gen_ai.provider.name": "openai",
        "gen_ai.request.model": "gpt-4o-mini",
        "gen_ai.usage.input_tokens": 42,
        "gen_ai.usage.output_tokens": 17,
        "session.id": "otel-demo",
    })

provider.shutdown()
print("Sent one span. Open Traces in Tracely.")
