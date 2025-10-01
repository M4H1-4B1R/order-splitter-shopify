import { randomBytes } from "crypto";

export default function handler(req, res) {
  const shop = req.query.shop;
  if (!shop) return res.status(400).send("Missing shop");
  const state = randomBytes(16).toString("hex");
  // set state in a cookie for simple CSRF protection
  res.setHeader(
    "Set-Cookie",
    `shopify_oauth_state=${state}; HttpOnly; Path=/; SameSite=Lax; Secure`
  );
  const scopes = encodeURIComponent(
    process.env.SCOPES || "write_orders,write_draft_orders,write_products"
  );
  const redirectUri = encodeURIComponent(
    `${process.env.HOST}/api/oauth/callback`
  );
  const url = `https://${shop}/admin/oauth/authorize?client_id=${process.env.SHOPIFY_API_KEY}&scope=${scopes}&redirect_uri=${redirectUri}&state=${state}`;
  res.writeHead(302, { Location: url });
  res.end();
}
