"use client";

export default function AppError({ error, reset }: { error: Error; reset: () => void }) {
  const storage = /ECONNREFUSED|fetch failed|ClickHouse|socket|Timeout/i.test(error.message);
  return (
    <div className="rounded-[10px] border border-line bg-panel px-6 py-10">
      <h1 className="text-[18px] font-bold">{storage ? "Tracely can't reach ClickHouse" : "This page failed to load"}</h1>
      <p className="mt-1 max-w-[60ch] text-ink-2">
        {storage
          ? "Telemetry is stored in ClickHouse. Check that it is running and that TRACELY_CLICKHOUSE_URL points at it, then try again."
          : "The server hit an error while loading this page. The server log has the details."}
      </p>
      <button className="btn btn-primary mt-4" onClick={reset}>Try again</button>
    </div>
  );
}
