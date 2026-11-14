/**
 * ClickHouse schema for telemetry. Applied idempotently on first use
 * (see lib/clickhouse.ts). Append new statements; never edit applied ones.
 */
export const DATABASE = process.env.TRACELY_CLICKHOUSE_DATABASE || "tracely";

export const MIGRATIONS: string[] = [
  `CREATE DATABASE IF NOT EXISTS ${DATABASE}`,
  `CREATE TABLE IF NOT EXISTS ${DATABASE}.spans (
    project_id LowCardinality(String),
    trace_id String,
    span_id String,
    parent_span_id String,
    name String,
    kind LowCardinality(String),
    service_name LowCardinality(String),
    environment LowCardinality(String),
    start_time DateTime64(6, 'UTC'),
    duration_ms Float64,
    status_code LowCardinality(String),
    status_message String,
    span_type LowCardinality(String),
    provider LowCardinality(String),
    model LowCardinality(String),
    operation LowCardinality(String),
    tool_name String,
    input_tokens UInt32,
    output_tokens UInt32,
    total_tokens UInt32,
    cost Float64,
    session_id String,
    user_id String,
    input String,
    output String,
    attributes Map(String, String),
    resource_attributes Map(String, String),
    events String
  )
  ENGINE = MergeTree
  PARTITION BY toDate(start_time)
  ORDER BY (project_id, start_time, trace_id)
  TTL toDateTime(start_time) + INTERVAL ${Number(process.env.TRACELY_RETENTION_DAYS || 90)} DAY`,
  `ALTER TABLE ${DATABASE}.spans ADD INDEX IF NOT EXISTS idx_trace trace_id TYPE bloom_filter(0.01) GRANULARITY 4`,
  `ALTER TABLE ${DATABASE}.spans ADD INDEX IF NOT EXISTS idx_session session_id TYPE bloom_filter(0.01) GRANULARITY 4`,
];
