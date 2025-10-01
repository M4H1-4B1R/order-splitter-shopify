import fetch from "node-fetch";
import { supabase } from "./supabase.js";
import { clamp } from "./shopify-utils.js";

// --- GraphQL queries / mutations (ported from the Remix handler) ---
const GET_ORDER_DETAILS_QUERY = `
  query getOrder($id: ID!) {
    order(id: $id) {
      id
      name
      tags
      metafields(namespaces: ["custom"]) {
        edges { node { namespace key value } }
      }
      displayFinancialStatus
      lineItems(first: 50) {
        nodes {
          id
          quantity
          variant { id price locationCode: metafield(namespace: "custom", key: "location_code") { value } }
          customAttributes { key value }
          product { id }
          location: assignedLocation { location { id isPresale: metafield(namespace: "custom", key: "pre_sale") { value } } }
        }
      }
    }
  }
`;

const CREATE_ORDER_MUTATION = `
  mutation draftOrderCreate($input: DraftOrderInput!) {
    draftOrderCreate(input: $input) {
      draftOrder { id order { id name } }
      userErrors { field message }
    }
  }
`;

const DRAFT_ORDER_COMPLETE_MUTATION = `
  mutation draftOrderComplete($id: ID!) {
    draftOrderComplete(id: $id) {
      draftOrder { id order { id name } }
      userErrors { field message }
    }
  }
`;

const ORDER_EDIT_MUTATION = `
  mutation orderEditBegin($id: ID!) {
    orderEditBegin(id: $id) {
      calculatedOrder { id calculatedLineItems(first: 50) { nodes { id quantity lineItem { id } } } }
      userErrors { field message }
    }
  }
`;

const ORDER_EDIT_SET_QUANTITY_MUTATION = `
  mutation orderEditSetQuantity($id: ID!, $lineItemId: ID!, $quantity: Int!) {
    orderEditSetQuantity(id: $id, lineItemId: $lineItemId, quantity: $quantity) {
      calculatedLineItem { id quantity }
      userErrors { field message }
    }
  }
`;

const ORDER_EDIT_REMOVE_LINEITEM_MUTATION = `
  mutation orderEditRemoveLineItem($id: ID!, $lineItemId: ID!) {
    orderEditRemoveLineItem(id: $id, lineItemId: $lineItemId) {
      calculatedLineItems { id }
      userErrors { field message }
    }
  }
`;

const ORDER_EDIT_COMMIT_MUTATION = `
  mutation orderEditCommit($id: ID!, $notifyCustomer: Boolean, $staffNote: String) {
    orderEditCommit(id: $id, notifyCustomer: $notifyCustomer, staffNote: $staffNote) {
      order { id }
      userErrors { field message }
    }
  }
`;

const TAGS_ADD_MUTATION = `
  mutation tagsAdd($id: ID!, $tags: [String!]!) {
    tagsAdd(id: $id, tags: $tags) { node { id } userErrors { field message } }
  }
`;

const METAFIELD_UPSERT_MUTATION = `
  mutation metafieldUpsert($ownerId: ID!, $namespace: String!, $key: String!, $value: String!, $type: String!) {
    metafieldUpsert(ownerId: $ownerId, namespace: $namespace, key: $key, value: $value, type: $type) {
      metafield { id key value }
      userErrors { field message }
    }
  }
`;

// Minimal Admin GraphQL call
async function adminGraphql(shop, accessToken, query, variables = {}) {
  const url = `https://${shop}/admin/api/2025-07/graphql.json`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });
  const data = await resp.json();
  return { resp, data };
}

// Retry wrapper with exponential backoff and DB alerting on final failure
async function graphqlWithRetry(
  shop,
  accessToken,
  query,
  variables = {},
  maxRetries = 3
) {
  let attempt = 0;
  while (true) {
    try {
      const { resp, data } = await adminGraphql(
        shop,
        accessToken,
        query,
        variables
      );
      const status = resp?.status;

      if (status === 429 || (status && status >= 500)) {
        throw new Error(`HTTP ${status}`);
      }

      if (data?.errors) {
        const asString = JSON.stringify(data.errors).toLowerCase();
        if (
          asString.includes("rate") ||
          asString.includes("throttle") ||
          asString.includes("throttled")
        ) {
          throw new Error("GraphQL rate limit");
        }
      }

      return data;
    } catch (err) {
      attempt++;
      if (attempt > maxRetries) {
        // Persist an alert to splitLog table for visibility
        try {
          await supabase.from("splitLog").insert({
            shop,
            originalOrderId: null,
            splitOrderIds: null,
            retained: false,
            message: clamp(
              `GraphQL retry failure: ${String(err?.message || err)}`,
              1000
            ),
          });
        } catch (dbErr) {
          console.warn(
            "Failed to write GraphQL retry alert to Supabase:",
            dbErr?.message || dbErr
          );
        }
        throw err;
      }
      const delay =
        Math.pow(2, attempt) * 1000 + Math.floor(Math.random() * 1000);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

// Main processing function: ported from Remix webhook handler but using Supabase for storage
export async function processOrderCreate({ shop, payload }) {
  // Load app settings (splittingEnabled)
  const { data: settingsRow } = await supabase
    .from("appSettings")
    .select("splittingEnabled")
    .eq("shop", shop)
    .single()
    .maybeSingle();
  const splittingEnabled = settingsRow?.splittingEnabled ?? true;
  if (!splittingEnabled) {
    return { success: false, reason: "splitting disabled" };
  }

  // Load shop access token
  const { data: shopRow } = await supabase
    .from("shops")
    .select("access_token")
    .eq("shop", shop)
    .single();
  const accessToken = shopRow?.access_token;
  if (!accessToken) throw new Error(`No access_token for shop ${shop}`);

  // sanitize order id
  const orderId = payload?.id || (payload?.order && payload.order.id);
  if (!orderId) throw new Error("No order id in payload");
  const orderGid = `gid://shopify/Order/${orderId}`;

  // 1) Fetch order details
  const orderResp = await graphqlWithRetry(
    shop,
    accessToken,
    GET_ORDER_DETAILS_QUERY,
    { id: orderGid }
  );
  const order = orderResp?.data?.order;
  if (!order) throw new Error("Order not found.");

  // 2) Duplicate prevention: check tags/metafields
  const existingTags = order.tags || [];
  const metafields = (order.metafields?.edges || []).map((e) => e.node) || [];
  const hasSplitId = metafields.find(
    (mf) => mf.namespace === "custom" && mf.key === "split_id"
  );
  if (
    existingTags.includes("split-processed") ||
    existingTags.includes("pre-sale-retained") ||
    hasSplitId
  ) {
    return { success: false, reason: "already_processed" };
  }

  // 3) Payment status
  if (order.displayFinancialStatus !== "PAID") {
    // tag order (best-effort)
    try {
      await graphqlWithRetry(shop, accessToken, TAGS_ADD_MUTATION, {
        id: orderGid,
        tags: ["order-not-paid"],
      });
    } catch (e) {
      console.warn("Failed to tag unpaid order:", e?.message || e);
    }
    // write splitLog
    try {
      await supabase.from("splitLog").insert({
        shop,
        originalOrderId: clamp(order.name || "", 255),
        splitOrderIds: null,
        retained: true,
        message: clamp("Order not paid.", 1000),
      });
    } catch (dbErr) {
      console.warn(
        "Failed to write unpaid order to Supabase:",
        dbErr?.message || dbErr
      );
    }
    return { success: false, reason: "not_paid" };
  }

  const lineItems = order.lineItems?.nodes || [];
  const presaleItems = [];
  const nonPresaleItems = [];
  for (const item of lineItems) {
    if (item.location?.isPresale?.value === "true") presaleItems.push(item);
    else nonPresaleItems.push(item);
  }

  // 4) Retain original if 0 or all presale
  if (presaleItems.length === 0 || presaleItems.length === lineItems.length) {
    const tag =
      presaleItems.length === 0 ? "no-presale-items" : "pre-sale-retained";
    try {
      await graphqlWithRetry(shop, accessToken, TAGS_ADD_MUTATION, {
        id: orderGid,
        tags: [tag],
      });
    } catch (e) {
      console.warn("Failed to add tag on retained order:", e?.message || e);
    }
    const splitId = `split_${Date.now()}`;
    try {
      await graphqlWithRetry(shop, accessToken, METAFIELD_UPSERT_MUTATION, {
        ownerId: orderGid,
        namespace: "custom",
        key: "split_id",
        value: splitId,
        type: "single_line_text_field",
      });
    } catch (e) {
      console.warn(
        "Failed to upsert split_id on retained order:",
        e?.message || e
      );
    }
    try {
      await supabase.from("splitLog").insert({
        shop,
        originalOrderId: clamp(order.name || "", 255),
        retained: true,
        message: clamp(
          presaleItems.length === 0
            ? "No pre-sale items in order."
            : "All items are pre-sale; order retained.",
          1000
        ),
      });
    } catch (dbErr) {
      console.warn(
        "Failed to write retained order log:",
        dbErr?.message || dbErr
      );
    }
    return { success: true, retained: true };
  }

  // 5) Prepare location mappings from Supabase
  const { data: mappings } = await supabase
    .from("locationMapping")
    .select("locationCode,locationGid")
    .eq("shop", shop);
  const mappingDict = (mappings || []).reduce((acc, m) => {
    acc[m.locationCode] = m.locationGid;
    return acc;
  }, {});
  const presaleGroups = {};
  for (const item of presaleItems) {
    const locationCode = item.variant?.locationCode?.value || "DEFAULT";
    if (!presaleGroups[locationCode]) presaleGroups[locationCode] = [];
    presaleGroups[locationCode].push(item);
  }

  const splitOrderIds = [];
  const splitCreationErrors = [];
  const missingMappings = [];

  // Create draft orders per presale group
  for (const locationCode of Object.keys(presaleGroups)) {
    const items = presaleGroups[locationCode];
    const locationId = mappingDict[locationCode];
    if (!locationId) {
      missingMappings.push(locationCode);
      continue;
    }

    const draftInput = {
      lineItems: items.map((it) => ({
        variantId: it.variant.id,
        quantity: it.quantity,
      })),
      shippingAddress: payload?.shipping_address || undefined,
      customer: payload?.customer?.id
        ? { id: `gid://shopify/Customer/${payload.customer.id}` }
        : undefined,
      tags: ["split-child"],
      note: clamp(
        `Split from ${clamp(order.name || "", 200)} for location ${locationCode}`,
        500
      ),
    };

    try {
      const createData = await graphqlWithRetry(
        shop,
        accessToken,
        CREATE_ORDER_MUTATION,
        { input: draftInput }
      );
      const createErrors = createData?.data?.draftOrderCreate?.userErrors || [];
      if (createErrors.length) {
        splitCreationErrors.push({ locationCode, errors: createErrors });
        continue;
      }
      const draftOrder = createData?.data?.draftOrderCreate?.draftOrder;
      if (!draftOrder?.id) {
        splitCreationErrors.push({ locationCode, reason: "no_draft_id" });
        continue;
      }

      const completeData = await graphqlWithRetry(
        shop,
        accessToken,
        DRAFT_ORDER_COMPLETE_MUTATION,
        { id: draftOrder.id }
      );
      const completeErrors =
        completeData?.data?.draftOrderComplete?.userErrors || [];
      if (completeErrors.length) {
        splitCreationErrors.push({ locationCode, errors: completeErrors });
      }

      const createdOrder =
        completeData?.data?.draftOrderComplete?.draftOrder?.order ||
        draftOrder?.order;
      const createdOrderId = createdOrder?.id || draftOrder.id;
      splitOrderIds.push(createdOrderId);
    } catch (err) {
      console.error(
        "Error creating/completing split order for",
        locationCode,
        err?.message || err
      );
      splitCreationErrors.push({
        locationCode,
        error: String(err?.message || err),
      });
      continue;
    }
  }

  // 6) Begin order edit on original to remove/reduce presale items
  try {
    const editBegin = await graphqlWithRetry(
      shop,
      accessToken,
      ORDER_EDIT_MUTATION,
      { id: orderGid }
    );
    const editErrors = editBegin?.data?.orderEditBegin?.userErrors || [];
    if (editErrors.length)
      throw new Error(
        `orderEditBegin userErrors: ${JSON.stringify(editErrors)}`
      );
    const calculatedOrderId =
      editBegin?.data?.orderEditBegin?.calculatedOrder?.id;
    const calculatedLines =
      editBegin?.data?.orderEditBegin?.calculatedOrder?.calculatedLineItems
        ?.nodes || [];

    const findCalculatedForOriginal = (originalId) =>
      calculatedLines.find((cl) => cl.lineItem?.id === originalId);

    for (const presaleItem of presaleItems) {
      const originalLineId = presaleItem.id;
      const calculated = findCalculatedForOriginal(originalLineId);
      if (!calculated) {
        console.warn("Could not find calculated line for", originalLineId);
        continue;
      }
      const originalQty = presaleItem.quantity;
      const calcQty = calculated.quantity;
      try {
        if (calcQty <= originalQty) {
          await graphqlWithRetry(
            shop,
            accessToken,
            ORDER_EDIT_REMOVE_LINEITEM_MUTATION,
            { id: calculatedOrderId, lineItemId: calculated.id }
          );
        } else {
          const newQty = calcQty - originalQty;
          await graphqlWithRetry(
            shop,
            accessToken,
            ORDER_EDIT_SET_QUANTITY_MUTATION,
            {
              id: calculatedOrderId,
              lineItemId: calculated.id,
              quantity: newQty,
            }
          );
        }
      } catch (err) {
        console.error("Error adjusting calculated line:", err?.message || err);
        continue;
      }
    }

    const commit = await graphqlWithRetry(
      shop,
      accessToken,
      ORDER_EDIT_COMMIT_MUTATION,
      {
        id: calculatedOrderId,
        notifyCustomer: false,
        staffNote: "Order split: pre-sale items removed",
      }
    );
    const commitErrors = commit?.data?.orderEditCommit?.userErrors || [];
    if (commitErrors.length)
      throw new Error(
        `orderEditCommit userErrors: ${JSON.stringify(commitErrors)}`
      );
  } catch (err) {
    console.error("Order edit failed for original order:", err?.message || err);
    // continue — we'll still try to tag and write logs
  }

  // Tag original order as split-processed
  try {
    await graphqlWithRetry(shop, accessToken, TAGS_ADD_MUTATION, {
      id: orderGid,
      tags: ["split-processed"],
    });
  } catch (e) {
    console.warn(
      "Failed to tag original order as split-processed:",
      e?.message || e
    );
  }

  // Upsert split_id metafield on original order
  const splitId = `split_${Date.now()}`;
  try {
    await graphqlWithRetry(shop, accessToken, METAFIELD_UPSERT_MUTATION, {
      ownerId: orderGid,
      namespace: "custom",
      key: "split_id",
      value: splitId,
      type: "single_line_text_field",
    });
  } catch (e) {
    console.warn("Failed to upsert split_id metafield:", e?.message || e);
  }

  // Log the split action into Supabase
  try {
    await supabase.from("splitLog").insert({
      shop,
      originalOrderId: clamp(order.name || "", 255),
      splitOrderIds: clamp(splitOrderIds.join(","), 1000),
      retained: false,
      message: clamp(
        `Order split into ${splitOrderIds.length} new orders.`,
        1000
      ),
    });
  } catch (dbErr) {
    console.warn("Failed to write splitLog:", dbErr?.message || dbErr);
  }

  return { success: true, splitOrderIds, splitCreationErrors, missingMappings };
}
