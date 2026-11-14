import { requireSession } from "@/lib/auth";
import { listAlertEvents, listChannels } from "@/lib/db";
import { dateTime } from "@/lib/format";
import { Badge, Empty, PageHeader, Panel } from "@/components/ui";
import { ActionForm, Field } from "@/components/forms";
import { checkNowAction, createChannelAction, deleteChannelAction, testChannelAction } from "../actions";

export const metadata = { title: "Alerts" };

export default async function AlertsPage() {
  const { project } = await requireSession();
  const channels = listChannels(project.id);
  const events = listAlertEvents(project.id);

  return (
    <>
      <PageHeader title="Alerts" description="Budget and anomaly alerts are checked every five minutes and sent to every channel below. Each condition alerts once."
        actions={<ActionForm action={checkNowAction} submit="Check now" inline className="flex" />} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-4">
          <Panel title="Channels" flush>
            {channels.length === 0 ? (
              <Empty title="No channels yet">Add a Slack incoming webhook or any HTTPS endpoint. Until then, alerts are only listed on this page.</Empty>
            ) : (
              <ul className="divide-y divide-line">
                {channels.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{c.name} <Badge>{c.type === "slack" ? "Slack" : "Webhook"}</Badge></div>
                      <div className="truncate font-mono text-[12.5px] text-ink-3">{new URL(c.url).origin}/…</div>
                    </div>
                    <ActionForm action={testChannelAction} submit="Send test" inline className="flex"><input type="hidden" name="id" value={c.id} /></ActionForm>
                    <form action={deleteChannelAction}><input type="hidden" name="id" value={c.id} /><button className="btn btn-quiet btn-sm">Remove</button></form>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="History" flush>
            {events.length === 0 ? (
              <p className="p-4 text-ink-2">No alerts have fired.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="data">
                  <thead><tr><th>When</th><th>Alert</th><th>Type</th><th>Sent to</th></tr></thead>
                  <tbody>
                    {events.map((e) => (
                      <tr key={e.id}>
                        <td className="num whitespace-nowrap align-top text-ink-2">{dateTime(e.created_at)}</td>
                        <td>
                          <div className="flex items-center gap-2"><Badge tone={e.severity === "critical" ? "critical" : "warning"} icon>{e.severity === "critical" ? "Critical" : "Warning"}</Badge><span className="font-medium">{e.title}</span></div>
                          <div className="mt-0.5 max-w-[70ch] text-[13px] text-ink-2">{e.body}</div>
                        </td>
                        <td className="align-top">{e.kind === "budget" ? "Budget" : "Anomaly"}</td>
                        <td className="num align-top">{e.delivered} {e.delivered === 1 ? "channel" : "channels"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>

        <Panel title="Add a channel">
          <ActionForm action={createChannelAction} submit="Add channel">
            <Field label="Name"><input className="field" name="name" placeholder="#llm-alerts" required /></Field>
            <Field label="Type">
              <select className="field" name="type" defaultValue="slack"><option value="slack">Slack incoming webhook</option><option value="webhook">Webhook (JSON POST)</option></select>
            </Field>
            <Field label="URL"><input className="field" name="url" type="url" placeholder="https://hooks.slack.com/services/…" required /></Field>
          </ActionForm>
        </Panel>
      </div>
    </>
  );
}
