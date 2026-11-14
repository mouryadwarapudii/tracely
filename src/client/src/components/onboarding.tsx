import Link from "next/link";
import { Panel } from "./ui";

export function Onboarding() {
  return (
    <Panel>
      <div className="max-w-[70ch]">
        <h2 className="text-[18px] font-bold">No telemetry yet</h2>
        <p className="mt-1 text-ink-2">Send your first trace in three steps. Data appears here within seconds.</p>
        <ol className="mt-5 flex flex-col gap-5">
          <li>
            <div className="font-semibold">1. Create an API key</div>
            <p className="text-ink-2">Keys are created under <Link className="text-accent hover:underline" href="/settings">Settings</Link>. Copy it when shown; it is displayed once.</p>
          </li>
          <li>
            <div className="font-semibold">2. Install the SDK</div>
            <pre className="mt-1.5 overflow-x-auto rounded-md bg-sunken px-3 py-2 font-mono text-[12.5px]">pip install tracely</pre>
          </li>
          <li>
            <div className="font-semibold">3. Initialise it before your first model call</div>
            <pre className="mt-1.5 overflow-x-auto rounded-md bg-sunken px-3 py-2 font-mono text-[12.5px]">{`import tracely

tracely.init(
    api_key="tr_...",
    endpoint="http://localhost:3000",
    service_name="my-app",
)
# OpenAI and Anthropic clients are now traced automatically.`}</pre>
          </li>
        </ol>
        <p className="mt-5 text-ink-2">
          Want to look around first? Load two weeks of demo data: <span className="font-mono text-[12.5px]">TRACELY_API_KEY=tr_... npm run seed</span>
        </p>
      </div>
    </Panel>
  );
}
