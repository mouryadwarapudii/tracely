"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import {
  createApiKey, createBudget, createChannel, deleteBudget, deleteChannel, deletePrompt, listChannels, revokeApiKey, savePromptVersion, type Budget,
} from "@/lib/db";
import { evaluateAlerts, sendTest } from "@/lib/alerts";

export type ActionState = { error?: string; message?: string; key?: string };

const str = (form: FormData, name: string) => String(form.get(name) || "").trim();

/* ---------- API keys ---------- */

export async function createKeyAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { project } = await requireSession();
  const name = str(form, "name");
  if (!name) return { error: "Give the key a name so you can tell it apart later." };
  const { key } = createApiKey(project.id, name.slice(0, 80));
  revalidatePath("/settings");
  return { key };
}

export async function revokeKeyAction(form: FormData) {
  const { project } = await requireSession();
  revokeApiKey(project.id, str(form, "id"));
  revalidatePath("/settings");
}

/* ---------- budgets ---------- */

const PERIODS = ["daily", "weekly", "monthly"];
const SCOPES = ["all", "model", "service", "user", "environment"];

export async function createBudgetAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { project } = await requireSession();
  const name = str(form, "name");
  const amount = Number(str(form, "amount"));
  const period = str(form, "period");
  const scopeType = str(form, "scope_type");
  const scopeValue = scopeType === "all" ? "" : str(form, "scope_value");
  const threshold = Number(str(form, "threshold_pct") || 80);
  if (!name) return { error: "Name the budget." };
  if (!(amount > 0)) return { error: "Enter an amount greater than zero." };
  if (!PERIODS.includes(period) || !SCOPES.includes(scopeType)) return { error: "Choose a period and what the budget applies to." };
  if (scopeType !== "all" && !scopeValue) return { error: `Enter the ${scopeType} this budget applies to.` };
  if (!(threshold >= 1 && threshold <= 100)) return { error: "The warning level must be between 1 and 100 percent." };
  createBudget({
    project_id: project.id, name: name.slice(0, 80), amount, period: period as Budget["period"],
    scope_type: scopeType as Budget["scope_type"], scope_value: scopeValue, threshold_pct: Math.round(threshold),
  });
  revalidatePath("/budgets");
  return { message: "Budget created." };
}

export async function deleteBudgetAction(form: FormData) {
  const { project } = await requireSession();
  deleteBudget(project.id, str(form, "id"));
  revalidatePath("/budgets");
}

/* ---------- alert channels ---------- */

export async function createChannelAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { project } = await requireSession();
  const name = str(form, "name");
  const type = str(form, "type");
  const url = str(form, "url");
  if (!name) return { error: "Name the channel." };
  if (type !== "slack" && type !== "webhook") return { error: "Choose Slack or webhook." };
  let parsed: URL;
  try { parsed = new URL(url); } catch { return { error: "Enter a full URL, starting with https://." }; }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return { error: "The URL must start with https:// or http://." };
  createChannel(project.id, name.slice(0, 80), type, url);
  revalidatePath("/alerts");
  return { message: "Channel added. Send a test to confirm it works." };
}

export async function deleteChannelAction(form: FormData) {
  const { project } = await requireSession();
  deleteChannel(project.id, str(form, "id"));
  revalidatePath("/alerts");
}

export async function testChannelAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { project } = await requireSession();
  const channel = listChannels(project.id).find((c) => c.id === str(form, "id"));
  if (!channel) return { error: "Channel not found." };
  return (await sendTest(channel)) ? { message: "Test sent." } : { error: "The endpoint did not accept the test. Check the URL." };
}

export async function checkNowAction(): Promise<ActionState> {
  const { project } = await requireSession();
  const { fired } = await evaluateAlerts(project.id);
  revalidatePath("/alerts");
  return { message: fired ? `${fired} new ${fired === 1 ? "alert" : "alerts"}.` : "Checked. Nothing new." };
}

/* ---------- prompts ---------- */

export async function savePromptAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { project, user } = await requireSession();
  const name = str(form, "name");
  const template = String(form.get("template") || "").replace(/\r\n/g, "\n");
  if (!/^[a-z0-9][a-z0-9._-]{0,79}$/.test(name)) return { error: "Use lowercase letters, digits, dots, dashes, or underscores for the name, e.g. support-reply." };
  if (!template.trim()) return { error: "Write the prompt text." };
  savePromptVersion(project.id, name, str(form, "description").slice(0, 200), template, str(form, "model").slice(0, 80), str(form, "notes").slice(0, 200), user.name);
  revalidatePath("/prompts");
  redirect(`/prompts/${encodeURIComponent(name)}`);
}

export async function deletePromptAction(form: FormData) {
  const { project } = await requireSession();
  deletePrompt(project.id, str(form, "name"));
  revalidatePath("/prompts");
  redirect("/prompts");
}
