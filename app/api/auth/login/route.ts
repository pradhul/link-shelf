import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  checkHouseholdPassword,
  createSessionToken,
  sessionMaxAgeSeconds,
} from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const password = String(body.password ?? "");
    const remember = Boolean(body.remember);

    if (!checkHouseholdPassword(password)) {
      return NextResponse.json(
        { error: "Incorrect password" },
        { status: 401 },
      );
    }

    const token = await createSessionToken(remember);
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: sessionMaxAgeSeconds(remember),
    });
    return res;
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
