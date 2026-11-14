/** Starts the in-process alert evaluator. Set TRACELY_ALERT_INTERVAL_SECONDS=0 to disable it and call /api/cron/evaluate from your own scheduler instead. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const seconds = Number(process.env.TRACELY_ALERT_INTERVAL_SECONDS ?? 300);
  if (!seconds) return;
  const g = globalThis as unknown as { __tracelyAlertTimer?: NodeJS.Timeout };
  if (g.__tracelyAlertTimer) return;
  const { evaluateAlerts } = await import("./lib/alerts");
  g.__tracelyAlertTimer = setInterval(() => {
    evaluateAlerts().catch((err) => console.error("[tracely] alert evaluation failed:", err?.message || err));
  }, seconds * 1000);
  g.__tracelyAlertTimer.unref?.();
}
