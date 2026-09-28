import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { parse as parseCookie } from "cookie";
import type { Request, Response } from "express";
import type { User } from "../drizzle-pg/schema";
import { getUserById, getUserByPhone } from "./db";

export const PHONE_SESSION_COOKIE = "golden_prime_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14;
const secret = new TextEncoder().encode(process.env.JWT_SECRET ?? "development-only-secret");

export function normalizePhone(phone: string) {
  return phone.replace(/\D/g, "").slice(-10);
}

export function toSafeUser(user: User) {
  const { passwordHash: _passwordHash, ...safeUser } = user;
  return safeUser;
}

export function hashPassword(password: string, salt = randomBytes(16).toString("hex")) {
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string) {
  const [salt, expected] = storedHash.split(":");
  if (!salt || !expected) return false;
  const actual = scryptSync(password, salt, 64).toString("hex");
  return actual.length === expected.length && timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}

function isSecureRequest(req: Request) {
  return req.protocol === "https" || req.headers["x-forwarded-proto"]?.toString().split(",").some(value => value.trim() === "https");
}

export async function createPhoneSession(user: User) {
  return new SignJWT({ auth: "phone-password" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(secret);
}

export function setPhoneSessionCookie(res: Response, req: Request, token: string) {
  res.cookie(PHONE_SESSION_COOKIE, token, {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: isSecureRequest(req),
    maxAge: SESSION_MAX_AGE_SECONDS * 1000,
  });
}

export function clearPhoneSessionCookie(res: Response, req: Request) {
  res.clearCookie(PHONE_SESSION_COOKIE, { httpOnly: true, path: "/", sameSite: "lax", secure: isSecureRequest(req) });
}

function isTransientDatabaseError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return /too many clients|connection terminated|connection timeout|connect e|timeout exceeded|server closed the connection/.test(message);
}

function wait(milliseconds: number) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

export async function getPhoneSessionUser(req: Request) {
  const token = parseCookie(req.headers.cookie ?? "")[PHONE_SESSION_COOKIE];
  if (!token) return null;
  let userId: number;
  try {
    const { payload } = await jwtVerify(token, secret);
    userId = Number(payload.sub);
    if (!Number.isSafeInteger(userId) || userId <= 0) return null;
  } catch {
    return null;
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return (await getUserById(userId)) ?? null;
    } catch (error) {
      if (!isTransientDatabaseError(error) || attempt === 2) return null;
      await wait(75 * (attempt + 1));
    }
  }
  return null;
}

export async function authenticatePhonePassword(phone: string, password: string) {
  const user = await getUserByPhone(normalizePhone(phone));
  if (!user?.passwordHash || !verifyPassword(password, user.passwordHash)) return null;
  return user;
}
