import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = ["/login", "/signup", "/api/otlp", "/api/v1", "/api/health", "/api/cron", "/v1/"];

/** Cheap gate: no session cookie means the sign-in page. Tokens are verified server-side in requireSession(). */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (!request.cookies.has("tracely_session")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/|favicon|icon|.*\\.(?:svg|png|ico|woff2)$).*)"] };
