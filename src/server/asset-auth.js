import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "weblab_asset_session";
const SESSION_SECONDS = 60 * 60 * 24 * 30;

function getSecret() {
  return process.env.WEBLAB_ASSET_PASSWORD || "";
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
}

function signExpiry(expiry, secret) {
  return createHmac("sha256", secret).update(String(expiry)).digest("hex");
}

export function verifyAssetPassword(password) {
  const secret = getSecret();
  return Boolean(secret && typeof password === "string" && safeEqual(password, secret));
}

export function createAssetSessionCookie() {
  const secret = getSecret();
  if (!secret) throw new Error("WEBLAB_ASSET_PASSWORD não está configurada na Vercel.");
  const expiry = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const value = expiry + "." + signExpiry(expiry, secret);
  return COOKIE_NAME + "=" + value
    + "; Path=/; Max-Age=" + SESSION_SECONDS
    + "; HttpOnly; Secure; SameSite=Strict";
}

export function hasAssetSession(request) {
  const secret = getSecret();
  if (!secret) return false;
  const cookieHeader = request.headers?.get ? request.headers.get("cookie") || "" : request.headers?.cookie || "";
  const entry = cookieHeader.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(COOKIE_NAME + "="));
  if (!entry) return false;
  const value = entry.slice(COOKIE_NAME.length + 1);
  const separator = value.indexOf(".");
  if (separator < 1) return false;
  const expiry = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  if (!/^\d{10}$/.test(expiry) || Number(expiry) <= Math.floor(Date.now() / 1000)) return false;
  return safeEqual(signature, signExpiry(expiry, secret));
}
