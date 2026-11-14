import { projectForKey } from "./db";

/** Resolves the project for an ingest or API request from `Authorization: Bearer <key>` or `x-tracely-key`. */
export function projectFromRequest(request: Request): string | null {
  const header = request.headers.get("authorization") || "";
  const key = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : request.headers.get("x-tracely-key") || "";
  return key ? projectForKey(key) : null;
}
