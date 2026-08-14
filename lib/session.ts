import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const SESSION_NAME = "starkeep_session";

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value) throw new Error("SESSION_SECRET is not configured.");
  return new TextEncoder().encode(value);
}

export async function createSession(userId: string) {
  return new SignJWT({ userId }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("30d").sign(secret());
}

export async function createReportVerificationToken(userId: string, email: string) {
  return new SignJWT({ purpose: "report-email-verification", userId, email }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("24h").sign(secret());
}

export async function verifyReportVerificationToken(token: string) {
  const verified = await jwtVerify(token, secret());
  const { purpose, userId, email } = verified.payload;
  if (purpose !== "report-email-verification" || typeof userId !== "string" || typeof email !== "string") throw new Error("Invalid verification token.");
  return { userId, email };
}


export async function getSessionUserId() {
  const token = (await cookies()).get(SESSION_NAME)?.value;
  if (!token) return null;
  try {
    const verified = await jwtVerify(token, secret());
    return typeof verified.payload.userId === "string" ? verified.payload.userId : null;
  } catch {
    return null;
  }
}

export function sessionCookie(token: string) {
  return { name: SESSION_NAME, value: token, options: { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30 } };
}

export function clearedSessionCookie() {
  return { name: SESSION_NAME, value: "", options: { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 } };
}
