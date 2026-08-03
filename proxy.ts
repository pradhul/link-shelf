import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "./lib/auth";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/telegram") ||
    pathname.startsWith("/api/cron") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/manifest.webmanifest") ||
    pathname.startsWith("/sw.js") ||
    pathname.startsWith("/icons")
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const ok = token ? await verifySessionToken(token) : false;

  if (!ok) {
    // Preserve Share Target POST body by converting to GET query for login return
    if (pathname === "/share" && request.method === "POST") {
      try {
        const form = await request.formData();
        const shared = [
          form.get("url")?.toString(),
          form.get("text")?.toString(),
          form.get("title")?.toString(),
        ]
          .filter(Boolean)
          .join("\n");
        const login = new URL("/login", request.url);
        const next = new URL("/share", request.url);
        if (shared) next.searchParams.set("text", shared);
        login.searchParams.set("next", `${next.pathname}${next.search}`);
        return NextResponse.redirect(login);
      } catch {
        /* fall through */
      }
    }

    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const login = new URL("/login", request.url);
    const nextPath = `${pathname}${request.nextUrl.search}`;
    login.searchParams.set("next", nextPath);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
