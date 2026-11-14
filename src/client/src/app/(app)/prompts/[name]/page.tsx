import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { promptByName, promptVersions } from "@/lib/db";
import { one } from "@/lib/time";
import { dateTime } from "@/lib/format";
import { Badge, Empty, Mono, Panel } from "@/components/ui";
import { ActionForm, CopyButton, Field } from "@/components/forms";
import { deletePromptAction, savePromptAction } from "../../actions";

export const metadata = { title: "Prompt" };

export default async function PromptPage({ params, searchParams }: { params: Promise<{ name: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { project } = await requireSession();
  const name = decodeURIComponent((await params).name);
  const prompt = promptByName(project.id, name);
  if (!prompt) return <Panel><Empty title="Prompt not found" action={<Link className="btn" href="/prompts">Back to prompts</Link>} /></Panel>;
  const versions = promptVersions(prompt.id);
  const wanted = Number(one((await searchParams).v));
  const shown = versions.find((v) => v.version === wanted) || versions[0];
  const variables = [...new Set([...shown.template.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]))];
  const snippet = `import tracely

prompt = tracely.get_prompt("${name}"${shown.version !== versions[0].version ? `, version=${shown.version}` : ""})
text = prompt.compile(${variables.map((v) => `${v}="..."`).join(", ")})`;

  return (
    <>
      <Link href="/prompts" className="mb-3 inline-flex items-center gap-1 text-[13px] font-medium text-ink-2 hover:text-accent"><ChevronLeft size={15} />Prompts</Link>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-mono text-[20px] font-medium leading-tight">{name}</h1>
          {prompt.description && <p className="mt-1 text-ink-2">{prompt.description}</p>}
        </div>
        <form action={deletePromptAction}><input type="hidden" name="name" value={name} /><button className="btn btn-sm">Delete prompt</button></form>
      </div>

      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <Panel title="Versions" flush className="self-start">
          <ul className="p-2">
            {versions.map((v, i) => (
              <li key={v.id}>
                <Link href={`/prompts/${encodeURIComponent(name)}${i === 0 ? "" : `?v=${v.version}`}`} aria-current={v.id === shown.id ? "page" : undefined}
                  className={`block rounded-md px-2 py-1.5 ${v.id === shown.id ? "bg-accent-soft text-accent" : "hover:bg-sunken"}`}>
                  <div className="flex items-center gap-2 font-medium">v{v.version}{i === 0 && <Badge tone="good">Latest</Badge>}</div>
                  <div className="text-[12.5px] text-ink-3">{dateTime(v.created_at)}</div>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>

        <div className="flex min-w-0 flex-col gap-4">
          <Panel title={`Version ${shown.version}`} hint={[shown.created_by && `Saved by ${shown.created_by}`, shown.model && `for ${shown.model}`, shown.notes].filter(Boolean).join(", ")} action={<CopyButton text={shown.template} />}>
            <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-sunken px-3 py-2.5 font-mono text-[12.5px] leading-relaxed">{shown.template}</pre>
            {variables.length > 0 && <p className="mt-2 text-[13px] text-ink-2">Variables: {variables.map((v) => <Mono key={v} className="mr-2">{v}</Mono>)}</p>}
          </Panel>

          <Panel title="Use it in your app" action={<CopyButton text={snippet} />}>
            <pre className="overflow-x-auto rounded-md bg-sunken px-3 py-2.5 font-mono text-[12.5px] leading-relaxed">{snippet}</pre>
          </Panel>

          <Panel title="Save a new version" hint={`Starts from version ${shown.version}. Existing versions never change.`}>
            <ActionForm action={savePromptAction} submit="Save as new version">
              <input type="hidden" name="name" value={name} />
              <Field label="Prompt"><textarea className="field font-mono !text-[12.5px]" name="template" rows={8} defaultValue={shown.template} required /></Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Intended model"><input className="field" name="model" defaultValue={shown.model} /></Field>
                <Field label="What changed"><input className="field" name="notes" placeholder="Shorter tone, added refund policy" /></Field>
              </div>
            </ActionForm>
          </Panel>
        </div>
      </div>
    </>
  );
}
