import { headers } from "next/headers";
import { requireSession } from "@/lib/auth";
import { listApiKeys } from "@/lib/db";
import { allPrices } from "@/lib/pricing";
import { ago } from "@/lib/format";
import { Badge, Mono, PageHeader, Panel } from "@/components/ui";
import { CopyButton, CreateKeyForm } from "@/components/forms";
import { createKeyAction, revokeKeyAction } from "../actions";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { project } = await requireSession();
  const keys = listApiKeys(project.id);
  const h = await headers();
  const origin = process.env.TRACELY_PUBLIC_URL || `${h.get("x-forwarded-proto") || "http"}://${h.get("host")}`;
  const env = `OTEL_EXPORTER_OTLP_ENDPOINT=${origin}
OTEL_EXPORTER_OTLP_HEADERS=Authorization=Bearer%20<your key>
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf`;

  return (
    <>
      <PageHeader title="Settings" />
      <div className="flex flex-col gap-4">
        <Panel title="API keys" hint="Keys authenticate the SDK and any OpenTelemetry exporter. Only a hash is stored.">
          <CreateKeyForm action={createKeyAction} />
          {keys.length > 0 && (
            <div className="mt-4 overflow-x-auto rounded-md border border-line">
              <table className="data">
                <thead><tr><th>Name</th><th>Key</th><th>Created</th><th>Last used</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {keys.map((k) => (
                    <tr key={k.id}>
                      <td className="font-medium">{k.name}</td>
                      <td><Mono>{k.prefix}…</Mono></td>
                      <td className="num text-ink-2">{ago(k.created_at)}</td>
                      <td className="num text-ink-2">{k.last_used_at ? ago(k.last_used_at) : "Never"}</td>
                      <td>{k.revoked_at ? <Badge>Revoked</Badge> : <Badge tone="good" icon>Active</Badge>}</td>
                      <td className="r">{!k.revoked_at && <form action={revokeKeyAction}><input type="hidden" name="id" value={k.id} /><button className="btn btn-quiet btn-sm">Revoke</button></form>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="Send data without the SDK" hint="Tracely accepts standard OTLP over HTTP (protobuf or JSON), so any OpenTelemetry SDK or Collector can export to it." action={<CopyButton text={env} />}>
          <pre className="overflow-x-auto rounded-md bg-sunken px-3 py-2.5 font-mono text-[12.5px] leading-relaxed">{env}</pre>
        </Panel>

        <Panel title="Price list" hint="USD per million tokens. Used when a span does not report its own cost. Edit src/constants/pricing.json to change it; verify against your provider's current prices." flush>
          <div className="overflow-x-auto">
            <table className="data">
              <thead><tr><th>Model (prefix match)</th><th>Provider</th><th className="r">Input</th><th className="r">Output</th><th>Optimizer suggests</th></tr></thead>
              <tbody>
                {allPrices().map((p) => (
                  <tr key={p.key}>
                    <td><Mono>{p.key}</Mono></td><td>{p.provider}</td>
                    <td className="r num">${p.input.toFixed(2)}</td><td className="r num">${p.output.toFixed(2)}</td>
                    <td className="text-ink-2">{p.cheaper ? <Mono>{p.cheaper}</Mono> : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </>
  );
}
