import { supabase } from "../../lib/supabase.js";
import { processOrderCreate } from "../../lib/processWebhook.js";

export default async function handler(req, res) {
  // lightweight auth: require a secret header to avoid public invocation
  const secret = req.headers["x-job-secret"];
  if (!secret || secret !== process.env.JOB_SECRET) {
    return res.status(401).send("Unauthorized");
  }

  // fetch a small batch of unprocessed webhook_events
  const { data: rows, error } = await supabase
    .from("webhook_events")
    .select("id, shop, topic, body, received_at")
    .order("received_at", { ascending: true })
    .limit(10);

  if (error) {
    console.error("Failed to fetch webhook_events", error);
    return res.status(500).json({ error: error.message || error });
  }

  const results = [];
  for (const row of rows || []) {
    try {
      const payload = JSON.parse(row.body || "{}");
      if (row.topic === "orders/create") {
        const out = await processOrderCreate({ shop: row.shop, payload });
        results.push({ id: row.id, ok: true, out });
      } else {
        results.push({ id: row.id, ok: false, reason: "unsupported topic" });
      }
      // mark processed: update webhook_events with processed_at
      await supabase
        .from("webhook_events")
        .update({ processed_at: new Date().toISOString() })
        .eq("id", row.id);
    } catch (err) {
      console.error("Failed to process webhook event", row.id, err);
      // mark failed with last_error message
      await supabase
        .from("webhook_events")
        .update({ last_error: String(err?.message || err) })
        .eq("id", row.id);
      results.push({
        id: row.id,
        ok: false,
        error: String(err?.message || err),
      });
    }
  }

  return res.json({ processed: results.length, results });
}
