import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col justify-center px-6 py-10 sm:px-12">
        <div className="mx-auto w-full max-w-[360px]">
          <div className="mb-8 flex items-center gap-2 text-[19px] font-bold tracking-tight"><Logo size={26} /> Tracely</div>
          {children}
        </div>
      </div>
      {/* The product, drawn: one agent run as a waterfall. */}
      <div className="hidden items-center justify-center border-l border-line bg-panel p-12 lg:flex" aria-hidden="true">
        <div className="w-full max-w-[520px]">
          <p className="mb-6 max-w-[30ch] text-[28px] font-bold leading-[1.15] tracking-tight">See every call your LLM app makes, and what it cost.</p>
          <div className="flex flex-col gap-[7px] font-mono text-[12.5px] text-ink-2">
            {[
              ["invoke_agent research-agent", 0, 100, "var(--s7)", "8.42 s"],
              ["chat claude-sonnet-4", 1, 24, "var(--s1)", "$0.012"],
              ["execute_tool web_search", 26, 12, "var(--s2)", "1.1 s"],
              ["query notes", 39, 3, "var(--s3)", "92 ms"],
              ["chat claude-sonnet-4", 43, 21, "var(--s1)", "$0.019"],
              ["execute_tool fetch_page", 65, 9, "var(--s2)", "740 ms"],
              ["chat claude-sonnet-4", 75, 24, "var(--s1)", "$0.031"],
            ].map(([name, left, width, color, note], i) => (
              <div key={i} className="grid grid-cols-[200px_1fr_56px] items-center gap-3">
                <span className="truncate" style={{ paddingLeft: i ? 14 : 0 }}>{name}</span>
                <span className="relative h-[10px] rounded-full bg-sunken">
                  <span className="absolute inset-y-0 rounded-full" style={{ left: `${left}%`, width: `${width}%`, background: color as string }} />
                </span>
                <span className="text-right text-ink-3">{note}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
