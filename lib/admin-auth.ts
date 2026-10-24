import {
  createHmac,
  createHash,
  timingSafeEqual,
} from "node:crypto";
import type { NextRequest } from "next/server";

export const ADMIN_SESSION_COOKIE = "rolink_admin_session";
const SESSION_DURATION_SECONDS = 8 * 60 * 60;

function safeEqual(left: string, right: string) {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();

  return timingSafeEqual(leftHash, rightHash);
}

function getSessionSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error("ADMIN_SESSION_SECRET must be at least 32 characters");
  }

  return secret;
}

export function verifyAdminPassword(password: string) {
  const configuredPassword = process.env.ADMIN_PASS;

  return Boolean(
    configuredPassword &&
      safeEqual(password, configuredPassword)
  );
}

export function createAdminSession() {
  const expiresAt =
    Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS;
  const payload = String(expiresAt);
  const signature = createHmac("sha256", getSessionSecret())
    .update(payload)
    .digest("base64url");

  return {
    value: `${payload}.${signature}`,
    maxAge: SESSION_DURATION_SECONDS,
  };
}

export function isAdminRequest(request: NextRequest) {
  const value = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;

  if (!value) {
    return false;
  }

  const [payload, signature, extra] = value.split(".");
  const expiresAt = Number(payload);

  if (
    !payload ||
    !signature ||
    extra ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= Math.floor(Date.now() / 1000)
  ) {
    return false;
  }

  try {
    const expected = createHmac("sha256", getSessionSecret())
      .update(payload)
      .digest("base64url");

    return safeEqual(signature, expected);
  } catch {
    return false;
  }
}

export function hasAdminConfiguration() {
  return Boolean(
    process.env.ADMIN_PASS &&
      process.env.ADMIN_SESSION_SECRET &&
      process.env.ADMIN_SESSION_SECRET.length >= 32
  );
}

export function isSameOriginRequest(request: NextRequest) {
  const origin = request.headers.get("origin");

  if (!origin) {
    return true;
  }

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}
