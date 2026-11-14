"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Activity, BellRing, Coins, FileText, Gauge, LogOut, Menu, MessagesSquare, Moon, PiggyBank, Settings, Sparkles, Sun, TriangleAlert, Waypoints, X,
} from "lucide-react";
import clsx from "clsx";
import { Logo } from "./logo";
import { RANGES, type RangeKey } from "@/lib/time";

const NAV = [
  { group: "Observe", items: [
    { href: "/overview", label: "Overview", icon: Gauge },
    { href: "/traces", label: "Traces", icon: Waypoints },
    { href: "/sessions", label: "Sessions", icon: MessagesSquare },
  ] },
  { group: "Spend", items: [
    { href: "/costs", label: "Costs", icon: Coins },
    { href: "/optimizer", label: "Optimizer", icon: Sparkles },
    { href: "/budgets", label: "Budgets", icon: PiggyBank },
  ] },
  { group: "Reliability", items: [
    { href: "/anomalies", label: "Anomalies", icon: TriangleAlert },
    { href: "/alerts", label: "Alerts", icon: BellRing },
  ] },
  { group: "Build", items: [{ href: "/prompts", label: "Prompts", icon: FileText }] },
];

/** Pages whose content does not depend on the time range hide the range picker. */
const UNSCOPED = ["/budgets", "/alerts", "/prompts", "/settings"];

function useScopeQuery() {
  const search = useSearchParams();
  const p = new URLSearchParams();
  for (const k of ["range", "env"]) if (search.get(k)) p.set(k, search.get(k)!);
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function Shell({ user, environments, signOut, children }: {
  user: { name: string; email: string };
  environments: string[];
  signOut: () => Promise<void>;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const scopeQuery = useScopeQuery();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  const scoped = !UNSCOPED.some((p) => pathname.startsWith(p));

  const nav = (
    <nav className="flex h-full flex-col gap-5 px-3 py-4" aria-label="Main">
      <Link href={`/overview${scopeQuery}`} className="flex items-center gap-2 px-2 text-[17px] font-bold tracking-tight">
        <Logo /> Tracely
      </Link>
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto">
        {NAV.map((g) => (
          <div key={g.group}>
            <div className="px-2 pb-1 text-[12.5px] text-ink-3">{g.group}</div>
            {g.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href + scopeQuery}
                  aria-current={active ? "page" : undefined}
                  className={clsx(
                    "flex items-center gap-2.5 rounded-md px-2 py-[7px] font-medium",
                    active ? "bg-accent-soft text-accent" : "text-ink-2 hover:bg-sunken hover:text-ink",
                  )}
                >
                  <item.icon size={16} strokeWidth={2} /> {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </div>
      <div className="border-t border-line pt-3">
        <Link href="/settings" className={clsx("flex items-center gap-2.5 rounded-md px-2 py-[7px] font-medium", pathname.startsWith("/settings") ? "bg-accent-soft text-accent" : "text-ink-2 hover:bg-sunken hover:text-ink")}>
          <Settings size={16} /> Settings
        </Link>
        <div className="mt-2 flex items-center justify-between gap-2 px-2">
          <div className="min-w-0">
            <div className="truncate font-medium">{user.name}</div>
            <div className="truncate text-[12.5px] text-ink-3">{user.email}</div>
          </div>
          <form action={signOut}>
            <button className="btn btn-quiet btn-sm !px-2" aria-label="Sign out" title="Sign out"><LogOut size={15} /></button>
          </form>
        </div>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen lg:pl-[224px]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[224px] border-r border-line bg-panel lg:block">{nav}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[250px] border-r border-line bg-panel">{nav}</aside>
        </div>
      )}
      <header className="sticky top-0 z-20 flex h-[52px] items-center gap-2 border-b border-line bg-bg/90 px-4 backdrop-blur lg:px-8">
        <button className="btn btn-quiet btn-sm !px-2 lg:hidden" onClick={() => setOpen(!open)} aria-label="Menu">{open ? <X size={18} /> : <Menu size={18} />}</button>
        <div className="flex items-center gap-1.5 text-[13px] text-ink-3"><Activity size={14} /> <span className="hidden sm:inline">Times are shown in UTC</span></div>
        <div className="ml-auto flex items-center gap-2">
          {scoped && <ScopeControls environments={environments} />}
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto max-w-[1280px] px-4 py-6 lg:px-8">{children}</main>
    </div>
  );
}

function ScopeControls({ environments }: { environments: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const range = (search.get("range") || "24h") as RangeKey;
  const env = search.get("env") || "";

  const set = (key: string, value: string, fallback: string) => {
    const p = new URLSearchParams(search.toString());
    if (value === fallback) p.delete(key); else p.set(key, value);
    p.delete("page");
    router.push(`${pathname}${p.size ? `?${p}` : ""}`);
  };

  return (
    <>
      {environments.length > 1 && (
        <select className="field !h-8 !w-auto !text-[13px]" value={env} onChange={(e) => set("env", e.target.value, "")} aria-label="Environment">
          <option value="">All environments</option>
          {environments.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
      )}
      <div className="flex rounded-md border border-line-strong bg-panel p-[2px]" role="group" aria-label="Time range">
        {(Object.keys(RANGES) as RangeKey[]).map((k) => (
          <button
            key={k}
            onClick={() => set("range", k, "24h")}
            aria-pressed={range === k}
            className={clsx("num rounded px-2.5 py-1 text-[13px] font-medium", range === k ? "bg-accent text-accent-ink" : "text-ink-2 hover:bg-sunken")}
          >
            {k}
          </button>
        ))}
      </div>
    </>
  );
}

function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const stamped = document.documentElement.dataset.theme;
    setDark(stamped ? stamped === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches);
  }, []);
  const toggle = () => {
    const next = dark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("tracely-theme", next); } catch {}
    setDark(!dark);
  };
  return (
    <button className="btn btn-quiet btn-sm !px-2" onClick={toggle} aria-label={dark ? "Use light theme" : "Use dark theme"} title={dark ? "Light theme" : "Dark theme"}>
      {dark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
