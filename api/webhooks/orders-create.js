import rawBody from "raw-body";
import { verifyWebhookHmac, clamp } from "../../lib/shopify-utils.js";
import { supabase } from "../../lib/supabase.js";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  const topic = req.headers["x-shopify-topic"];
  const shop = req.headers["x-shopify-shop-domain"];
  const hmac = req.headers["x-shopify-hmac-sha256"];

  if (topic !== "orders/create")
    return res.status(400).send("Unsupported topic");

  const raw = (await rawBody(req)).toString();
  if (!verifyWebhookHmac(raw, hmac, process.env.SHOPIFY_API_SECRET)) {
    return res.status(401).send("HMAC validation failed");
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (e) {
    return res.status(400).send("Invalid JSON");
  }

  // persist minimal audit to Supabase; keep payload clamped to avoid huge rows
  const row = {
    shop: shop || null,
    topic,
    order_id: clamp(payload?.id || payload?.order?.id || "", 200),
    body: clamp(
      typeof payload === "string" ? payload : JSON.stringify(payload),
      2000
    ),
    received_at: new Date().toISOString(),
  };

  try {
    await supabase.from("webhook_events").insert(row);
  } catch (err) {
    console.error("Failed to persist webhook event", err);
    // non-fatal: still respond 200 so Shopify doesn't keep retrying excessively
  }

  // quick response — do heavier processing asynchronously (or call your job executor)
  res.status(200).send("OK");
}
