import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomBytes, randomUUID, createHash } from "node:crypto";

/**
 * Application metadata (users, projects, API keys, budgets, alert channels,
 * prompts) lives in SQLite. Telemetry lives in ClickHouse.
 */

type Globals = { __tracelyDb?: DatabaseSync };
const g = globalThis as unknown as Globals;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  password_hash TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL, prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL, last_used_at INTEGER, revoked_at INTEGER
);
CREATE TABLE IF NOT EXISTS budgets (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL, amount REAL NOT NULL,
  period TEXT NOT NULL, scope_type TEXT NOT NULL, scope_value TEXT NOT NULL DEFAULT '',
  threshold_pct INTEGER NOT NULL DEFAULT 80, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS alert_channels (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL,
  url TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS alert_events (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, kind TEXT NOT NULL, severity TEXT NOT NULL,
  title TEXT NOT NULL, body TEXT NOT NULL, link TEXT NOT NULL DEFAULT '', dedupe_key TEXT NOT NULL,
  delivered INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL,
  UNIQUE (project_id, dedupe_key)
);
CREATE TABLE IF NOT EXISTS prompts (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL, UNIQUE (project_id, name)
);
CREATE TABLE IF NOT EXISTS prompt_versions (
  id TEXT PRIMARY KEY, prompt_id TEXT NOT NULL, version INTEGER NOT NULL, template TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', created_by TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL, UNIQUE (prompt_id, version)
);
`;

export function db(): DatabaseSync {
  if (!g.__tracelyDb) {
    const dir = process.env.TRACELY_DATA_DIR || join(process.cwd(), "data");
    mkdirSync(dir, { recursive: true });
    const d = new DatabaseSync(join(dir, "tracely.db"));
    d.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    d.exec(SCHEMA);
    g.__tracelyDb = d;
  }
  return g.__tracelyDb;
}

export const id = () => randomUUID();
export const now = () => Date.now();

function all<T>(sql: string, ...args: (string | number | null)[]): T[] {
  return db().prepare(sql).all(...args) as T[];
}
function get<T>(sql: string, ...args: (string | number | null)[]): T | undefined {
  return db().prepare(sql).get(...args) as T | undefined;
}
function run(sql: string, ...args: (string | number | null)[]) {
  return db().prepare(sql).run(...args);
}

/* ---------- settings ---------- */

export function setting(key: string, create?: () => string): string | undefined {
  const row = get<{ value: string }>("SELECT value FROM settings WHERE key = ?", key);
  if (row) return row.value;
  if (!create) return undefined;
  const value = create();
  run("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", key, value);
  return get<{ value: string }>("SELECT value FROM settings WHERE key = ?", key)!.value;
}

/* ---------- users & projects ---------- */

export type User = { id: string; email: string; name: string; password_hash: string; created_at: number };
export type Project = { id: string; name: string; created_at: number };

export const userCount = () => get<{ n: number }>("SELECT count(*) AS n FROM users")!.n;
export const userByEmail = (email: string) => get<User>("SELECT * FROM users WHERE email = ?", email.toLowerCase());
export const userById = (uid: string) => get<User>("SELECT * FROM users WHERE id = ?", uid);

export function createUser(email: string, name: string, passwordHash: string): User {
  const user: User = { id: id(), email: email.toLowerCase(), name, password_hash: passwordHash, created_at: now() };
  run("INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)", user.id, user.email, user.name, user.password_hash, user.created_at);
  return user;
}

/** The MVP runs one project per deployment; the schema already carries project_id everywhere. */
export function defaultProject(): Project {
  const existing = get<Project>("SELECT * FROM projects ORDER BY created_at LIMIT 1");
  if (existing) return existing;
  const project: Project = { id: "default", name: "Default project", created_at: now() };
  run("INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)", project.id, project.name, project.created_at);
  return project;
}

/* ---------- API keys ---------- */

export type ApiKey = { id: string; project_id: string; name: string; prefix: string; created_at: number; last_used_at: number | null; revoked_at: number | null };

const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

/** Returns the plaintext key once; only its hash is stored. */
export function createApiKey(projectId: string, name: string): { key: string; record: ApiKey } {
  const key = `tr_${randomBytes(24).toString("hex")}`;
  const record: ApiKey = { id: id(), project_id: projectId, name, prefix: key.slice(0, 9), created_at: now(), last_used_at: null, revoked_at: null };
  run("INSERT INTO api_keys (id, project_id, name, prefix, key_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)", record.id, projectId, name, record.prefix, hashKey(key), record.created_at);
  return { key, record };
}

export function projectForKey(key: string): string | null {
  const row = get<{ id: string; project_id: string; last_used_at: number | null }>(
    "SELECT id, project_id, last_used_at FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL",
    hashKey(key),
  );
  if (!row) return null;
  if (!row.last_used_at || now() - row.last_used_at > 60_000) run("UPDATE api_keys SET last_used_at = ? WHERE id = ?", now(), row.id);
  return row.project_id;
}

export const listApiKeys = (projectId: string) =>
  all<ApiKey>("SELECT id, project_id, name, prefix, created_at, last_used_at, revoked_at FROM api_keys WHERE project_id = ? ORDER BY created_at DESC", projectId);
export const revokeApiKey = (projectId: string, keyId: string) =>
  run("UPDATE api_keys SET revoked_at = ? WHERE id = ? AND project_id = ?", now(), keyId, projectId);

/* ---------- budgets ---------- */

export type Budget = {
  id: string; project_id: string; name: string; amount: number;
  period: "daily" | "weekly" | "monthly";
  scope_type: "all" | "model" | "service" | "user" | "environment";
  scope_value: string; threshold_pct: number; created_at: number;
};

export const listBudgets = (projectId: string) => all<Budget>("SELECT * FROM budgets WHERE project_id = ? ORDER BY created_at", projectId);
export function createBudget(b: Omit<Budget, "id" | "created_at">) {
  run("INSERT INTO budgets (id, project_id, name, amount, period, scope_type, scope_value, threshold_pct, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    id(), b.project_id, b.name, b.amount, b.period, b.scope_type, b.scope_value, b.threshold_pct, now());
}
export const deleteBudget = (projectId: string, budgetId: string) => run("DELETE FROM budgets WHERE id = ? AND project_id = ?", budgetId, projectId);

/* ---------- alerts ---------- */

export type AlertChannel = { id: string; project_id: string; name: string; type: "slack" | "webhook"; url: string; created_at: number };
export type AlertEvent = { id: string; project_id: string; kind: "budget" | "anomaly"; severity: "info" | "warning" | "critical"; title: string; body: string; link: string; dedupe_key: string; delivered: number; created_at: number };

export const listChannels = (projectId: string) => all<AlertChannel>("SELECT * FROM alert_channels WHERE project_id = ? ORDER BY created_at", projectId);
export function createChannel(projectId: string, name: string, type: AlertChannel["type"], url: string) {
  run("INSERT INTO alert_channels (id, project_id, name, type, url, created_at) VALUES (?, ?, ?, ?, ?, ?)", id(), projectId, name, type, url, now());
}
export const deleteChannel = (projectId: string, channelId: string) => run("DELETE FROM alert_channels WHERE id = ? AND project_id = ?", channelId, projectId);

/** Inserts the event unless one with the same dedupe key exists. Returns the event only when it is new. */
export function recordAlert(e: Omit<AlertEvent, "id" | "created_at" | "delivered">): AlertEvent | null {
  const event: AlertEvent = { ...e, id: id(), created_at: now(), delivered: 0 };
  const res = run("INSERT OR IGNORE INTO alert_events (id, project_id, kind, severity, title, body, link, dedupe_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    event.id, e.project_id, e.kind, e.severity, e.title, e.body, e.link, e.dedupe_key, event.created_at);
  return res.changes ? event : null;
}
export const markDelivered = (eventId: string, count: number) => run("UPDATE alert_events SET delivered = ? WHERE id = ?", count, eventId);
export const listAlertEvents = (projectId: string, limit = 100) =>
  all<AlertEvent>("SELECT * FROM alert_events WHERE project_id = ? ORDER BY created_at DESC LIMIT ?", projectId, limit);

/* ---------- prompts ---------- */

export type Prompt = { id: string; project_id: string; name: string; description: string; created_at: number };
export type PromptVersion = { id: string; prompt_id: string; version: number; template: string; model: string; notes: string; created_by: string; created_at: number };
export type PromptSummary = Prompt & { latest_version: number; updated_at: number };

export const listPrompts = (projectId: string) =>
  all<PromptSummary>(
    `SELECT p.*, max(v.version) AS latest_version, max(v.created_at) AS updated_at
     FROM prompts p JOIN prompt_versions v ON v.prompt_id = p.id
     WHERE p.project_id = ? GROUP BY p.id ORDER BY updated_at DESC`, projectId);
export const promptByName = (projectId: string, name: string) => get<Prompt>("SELECT * FROM prompts WHERE project_id = ? AND name = ?", projectId, name);
export const promptVersions = (promptId: string) => all<PromptVersion>("SELECT * FROM prompt_versions WHERE prompt_id = ? ORDER BY version DESC", promptId);

export function savePromptVersion(projectId: string, name: string, description: string, template: string, model: string, notes: string, createdBy: string): number {
  let prompt = promptByName(projectId, name);
  if (!prompt) {
    prompt = { id: id(), project_id: projectId, name, description, created_at: now() };
    run("INSERT INTO prompts (id, project_id, name, description, created_at) VALUES (?, ?, ?, ?, ?)", prompt.id, projectId, name, description, prompt.created_at);
  } else if (description) {
    run("UPDATE prompts SET description = ? WHERE id = ?", description, prompt.id);
  }
  const next = (get<{ v: number | null }>("SELECT max(version) AS v FROM prompt_versions WHERE prompt_id = ?", prompt.id)?.v || 0) + 1;
  run("INSERT INTO prompt_versions (id, prompt_id, version, template, model, notes, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    id(), prompt.id, next, template, model, notes, createdBy, now());
  return next;
}
export function deletePrompt(projectId: string, name: string) {
  const prompt = promptByName(projectId, name);
  if (!prompt) return;
  run("DELETE FROM prompt_versions WHERE prompt_id = ?", prompt.id);
  run("DELETE FROM prompts WHERE id = ?", prompt.id);
}
