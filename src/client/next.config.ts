import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async rewrites() {
    // Standard OTLP exporters append /v1/traces to their endpoint, so the
    // dashboard URL itself can be used as OTEL_EXPORTER_OTLP_ENDPOINT.
    return [{ source: "/v1/traces", destination: "/api/otlp/v1/traces" }];
  },
};

export default config;
