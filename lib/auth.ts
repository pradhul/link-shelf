import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "shelf_session";

function getSecret() {
  const secret = process.env.HOUSEHOLD_SESSION_SECRET;
  if (!secret) {
    throw new Error("HOUSEHOLD_SESSION_SECRET is not set");
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(remember: boolean) {
  const expiresIn = remember ? "30d" : "24h";
  return new SignJWT({ household: true })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(getSecret());
}

export async function verifySessionToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload.household === true;
  } catch {
    return false;
  }
}

export async function isAuthenticated() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return false;
  return verifySessionToken(token);
}

export function checkHouseholdPassword(password: string) {
  const expected = process.env.HOUSEHOLD_PASSWORD;
  if (!expected) {
    throw new Error("HOUSEHOLD_PASSWORD is not set");
  }
  return password === expected;
}

export function sessionMaxAgeSeconds(remember: boolean) {
  return remember ? 60 * 60 * 24 * 30 : 60 * 60 * 24;
}
