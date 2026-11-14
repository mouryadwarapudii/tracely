import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { listPrompts } from "@/lib/db";
import { ago } from "@/lib/format";
import { Empty, Mono, PageHeader, Panel } from "@/components/ui";
import { ActionForm, Field } from "@/components/forms";
import { savePromptAction } from "../actions";

export const metadata = { title: "Prompts" };

export default async function PromptsPage() {
  const { project } = await requireSession();
  const prompts = listPrompts(project.id);
  return (
    <>
      <PageHeader title="Prompts" description="Keep prompts here instead of in code. Every save creates a new version, and your app fetches the latest or a pinned one at runtime." />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
        <Panel flush>
          {prompts.length === 0 ? (
            <Empty title="No prompts yet">Create one on the right. Mark variables with double braces, like <Mono>{"{{customer_name}}"}</Mono>.</Empty>
          ) : (
            <table className="data">
              <thead><tr><th>Name</th><th>Description</th><th className="r">Latest</th><th className="r">Updated</th></tr></thead>
              <tbody>
                {prompts.map((p) => (
                  <tr key={p.id}>
                    <td><Link className="hover:text-accent hover:underline" href={`/prompts/${encodeURIComponent(p.name)}`}><Mono>{p.name}</Mono></Link></td>
                    <td className="text-ink-2">{p.description}</td>
                    <td className="r num">v{p.latest_version}</td>
                    <td className="r num text-ink-2">{ago(p.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
        <Panel title="New prompt">
          <ActionForm action={savePromptAction} submit="Save prompt">
            <Field label="Name" hint="Lowercase, no spaces. This is what your code asks for."><input className="field font-mono" name="name" placeholder="support-reply" required /></Field>
            <Field label="Description"><input className="field" name="description" placeholder="First reply to a support ticket" /></Field>
            <Field label="Prompt"><textarea className="field font-mono !text-[12.5px]" name="template" rows={8} placeholder={"You are a support agent for {{company}}.\nReply to: {{ticket}}"} required /></Field>
            <Field label="Intended model" hint="Optional. Returned with the prompt so your code can use it."><input className="field" name="model" placeholder="gpt-4o-mini" /></Field>
          </ActionForm>
        </Panel>
      </div>
    </>
  );
}
