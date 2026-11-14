"use server";

import { redirect } from "next/navigation";
import { createUser, defaultProject, userByEmail, userCount } from "@/lib/db";
import { endSession, hashPassword, startSession, verifyPassword } from "@/lib/auth";

export type FormState = { error?: string };

export async function signUp(_: FormState, form: FormData): Promise<FormState> {
  // Self-service sign-up creates the first account only. Later accounts are invited (see docs/roadmap).
  if (userCount() > 0) return { error: "This workspace already has an owner. Sign in instead." };
  const name = String(form.get("name") || "").trim();
  const email = String(form.get("email") || "").trim().toLowerCase();
  const password = String(form.get("password") || "");
  if (!name) return { error: "Enter your name." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "Enter a valid email address." };
  if (password.length < 10) return { error: "Use a password of at least 10 characters." };
  const user = createUser(email, name, hashPassword(password));
  defaultProject();
  await startSession(user.id);
  redirect("/overview");
}

export async function signIn(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") || "").trim().toLowerCase();
  const password = String(form.get("password") || "");
  const user = userByEmail(email);
  // Same message for both failures so the form does not reveal which emails exist.
  if (!user || !verifyPassword(password, user.password_hash)) return { error: "Email or password is incorrect." };
  await startSession(user.id);
  redirect("/overview");
}

export async function signOut() {
  await endSession();
  redirect("/login");
}

