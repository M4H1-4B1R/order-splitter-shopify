import fetch from "node-fetch";
import { supabase } from "../../lib/supabase.js";
import { verifyQueryHmac, clamp } from "../../lib/shopify-utils.js";

export default async function handler(req, res) {
  const { shop, code, state, hmac } = req.query;
  const cookieState = (req.headers.cookie || "")
    .split(";")
    .map((s) => s.trim())
    .find((c) => c.startsWith("shopify_oauth_state="))
    ?.split("=")[1];
  if (
    !shop ||
    !code ||
    !state ||
    !hmac ||
    !cookieState ||
    cookieState !== state
  ) {
    return res.status(400).send("Missing or invalid OAuth parameters");
  }

  if (!verifyQueryHmac(req.query, process.env.SHOPIFY_API_SECRET)) {
    return res.status(400).send("HMAC validation failed");
  }

  try {
    const tokenResp = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.SHOPIFY_API_KEY,
        client_secret: process.env.SHOPIFY_API_SECRET,
        code,
      }),
    });
    const tokenJson = await tokenResp.json();
    if (!tokenJson.access_token) {
      return res
        .status(500)
        .json({ error: "Failed to obtain access token", details: tokenJson });
    }

    // persist shop credentials to Supabase
    const shopRow = {
      shop,
      access_token: clamp(tokenJson.access_token, 2000),
      scope: clamp(tokenJson.scope || "", 500),
      installed_at: new Date().toISOString(),
    };
    await supabase.from("shops").upsert(shopRow, { onConflict: ["shop"] });

    // Register ORDERS_CREATE webhook (REST Admin API)
    const webhookEndpoint = `${process.env.HOST.replace(/\/$/, "")}/api/webhooks/orders-create`;
    try {
      await fetch(`https://${shop}/admin/api/2025-07/webhooks.json`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": tokenJson.access_token,
        },
        body: JSON.stringify({
          webhook: {
            topic: "orders/create",
            address: webhookEndpoint,
            format: "json",
          },
        }),
      });
    } catch (err) {
      console.warn("webhook registration failed", err.message || err);
    }

    // redirect back to your app UI (set this to your app root)
    res.writeHead(302, { Location: `${process.env.HOST}/?shop=${shop}` });
    res.end();
  } catch (err) {
    console.error("OAuth exchange error", err);
    res.status(500).send("OAuth exchange failed");
  }
}
