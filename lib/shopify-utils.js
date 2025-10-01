import crypto from "crypto";

export function verifyQueryHmac(query, secret) {
  const { hmac, signature, ...rest } = query;
  const message = Object.keys(rest)
    .sort()
    .map((k) => `${k}=${Array.isArray(rest[k]) ? rest[k].join(",") : rest[k]}`)
    .join("&");
  const digest = crypto
    .createHmac("sha256", secret)
    .update(message)
    .digest("hex");
  return digest === hmac || digest === signature;
}

export function verifyWebhookHmac(rawBody, hmacHeader, secret) {
  if (!hmacHeader) return false;
  const digest = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("base64");
  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader));
  } catch (e) {
    return false;
  }
}

export function clamp(str = "", max = 1000) {
  return String(str).slice(0, max);
}
