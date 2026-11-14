import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { defaultProject, setting, userById, type Project, type User } from "./db";

export const SESSION_COOKIE = "tracely_session";
const WEEK = 60 * 60 * 24 * 7;

function secret(): Uint8Array {
  // Set TRACELY_SECRET in production. Otherwise a random secret is generated once and kept in the data directory.
  const value = process.env.TRACELY_SECRET || setting("session_secret", () => randomBytes(32).toString("hex"))!;
  return new TextEncoder().encode(value);
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("hex")}$${scryptSync(password, salt, 64).toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(password, Buffer.from(salt, "hex"), expected.length);
  return timingSafeEqual(expected, actual);
}

export async function startSession(userId: string) {
  const token = await new SignJWT({ sub: userId }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(`${WEEK}s`).sign(secret());
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.TRACELY_INSECURE_COOKIES ? false : process.env.NODE_ENV === "production",
    path: "/",
    maxAge: WEEK,
  });
}

export async function endSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return (payload.sub && userById(payload.sub)) || null;
  } catch {
    return null;
  }
}

/** For pages and server actions: the signed-in user and their project, or a redirect to sign-in. */
export async function requireSession(): Promise<{ user: User; project: Project }> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return { user, project: defaultProject() };
}
