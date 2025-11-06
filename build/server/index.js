var _a;
import { jsx, jsxs } from "react/jsx-runtime";
import { PassThrough } from "node:stream";
import { createReadableStreamFromReadable } from "@react-router/node";
import { ServerRouter, UNSAFE_withComponentProps, Meta, Links, Outlet, ScrollRestoration, Scripts, useLoaderData, useActionData, Form, redirect, Link, UNSAFE_withErrorBoundaryProps, useRouteError, useSubmit, useNavigate, useLocation } from "react-router";
import { isbot } from "isbot";
import { renderToPipeableStream } from "react-dom/server";
import { AppProvider, BlockStack, Card, Text, ChoiceList, Button, FormLayout, TextField, Select, LegacyStack, DataTable, Pagination, Page, Tabs } from "@shopify/polaris";
import "@shopify/shopify-app-react-router/adapters/node";
import { shopifyApp, AppDistribution, ApiVersion, LoginErrorType, boundary } from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { PrismaClient } from "@prisma/client";
import { AppProvider as AppProvider$1 } from "@shopify/shopify-app-react-router/react";
import { useState, useCallback } from "react";
import { json } from "@remix-run/node";
import { format } from "date-fns";
const streamTimeout = 5e3;
function handleRequest(request, responseStatusCode, responseHeaders, routerContext, loadContext) {
  return new Promise((resolve, reject) => {
    let shellRendered = false;
    let userAgent = request.headers.get("user-agent");
    let readyOption = userAgent && isbot(userAgent) || routerContext.isSpaMode ? "onAllReady" : "onShellReady";
    let timeoutId = setTimeout(
      () => abort(),
      streamTimeout + 1e3
    );
    const { pipe, abort } = renderToPipeableStream(
      /* @__PURE__ */ jsx(ServerRouter, { context: routerContext, url: request.url }),
      {
        [readyOption]() {
          shellRendered = true;
          const body = new PassThrough({
            final(callback) {
              clearTimeout(timeoutId);
              timeoutId = void 0;
              callback();
            }
          });
          const stream = createReadableStreamFromReadable(body);
          responseHeaders.set("Content-Type", "text/html");
          pipe(body);
          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode
            })
          );
        },
        onShellError(error) {
          reject(error);
        },
        onError(error) {
          responseStatusCode = 500;
          if (shellRendered) {
            console.error(error);
          }
        }
      }
    );
  });
}
const entryServer = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: handleRequest,
  streamTimeout
}, Symbol.toStringTag, { value: "Module" }));
const polarisStylesUrl = "/assets/styles-C7YjYK5e.css";
const links = () => [{
  rel: "stylesheet",
  href: polarisStylesUrl
}];
const root = UNSAFE_withComponentProps(function App() {
  return /* @__PURE__ */ jsxs("html", {
    children: [/* @__PURE__ */ jsxs("head", {
      children: [/* @__PURE__ */ jsx("meta", {
        charSet: "utf-8"
      }), /* @__PURE__ */ jsx("meta", {
        name: "viewport",
        content: "width=device-width,initial-scale=1"
      }), /* @__PURE__ */ jsx(Meta, {}), /* @__PURE__ */ jsx(Links, {})]
    }), /* @__PURE__ */ jsxs("body", {
      children: [/* @__PURE__ */ jsx(AppProvider, {
        i18n: {},
        children: /* @__PURE__ */ jsx(Outlet, {})
      }), /* @__PURE__ */ jsx(ScrollRestoration, {}), /* @__PURE__ */ jsx(Scripts, {})]
    })]
  });
});
const route0 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: root,
  links
}, Symbol.toStringTag, { value: "Module" }));
let db;
if (process.env.NODE_ENV !== "production") {
  db = new PrismaClient();
  db.$connect();
  console.log("Connected to db");
} else {
  if (!global.db) {
    global.db = new PrismaClient();
    global.db.$connect();
    console.log("Connected to db");
  }
  db = global.db;
}
const db$1 = db;
const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.July25,
  scopes: (_a = process.env.SCOPES) == null ? void 0 : _a.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(db$1),
  distribution: AppDistribution.AppStore,
  ...process.env.SHOP_CUSTOM_DOMAIN ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] } : {}
});
ApiVersion.July25;
shopify.addDocumentResponseHeaders;
const authenticate = shopify.authenticate;
shopify.unauthenticated;
const login = shopify.login;
shopify.registerWebhooks;
shopify.sessionStorage;
const action$4 = async ({
  request
}) => {
  const {
    payload,
    session,
    topic,
    shop
  } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);
  const current = payload.current;
  if (session) {
    await db$1.session.update({
      where: {
        id: session.id
      },
      data: {
        scope: current.toString()
      }
    });
  }
  return new Response();
};
const route1 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$4
}, Symbol.toStringTag, { value: "Module" }));
const action$3 = async ({
  request
}) => {
  const {
    shop,
    session,
    topic
  } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);
  if (session) {
    await db$1.session.deleteMany({
      where: {
        shop
      }
    });
  }
  return new Response();
};
const route2 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$3
}, Symbol.toStringTag, { value: "Module" }));
const GET_ORDER_DETAILS_QUERY = `
  query getOrder($id: ID!) {
    order(id: $id) {
      id
      name
      tags
      metafields(namespaces: ["custom"]) {
        edges {
          node {
            namespace
            key
            value
          }
        }
      }
      displayFinancialStatus
      lineItems(first: 50) {
        nodes {
          id
          quantity
          variant {
            id
            price
            locationCode: metafield(namespace: "custom", key: "location_code") {
              value
            }
          }
          customAttributes {
            key
            value
          }
          product {
            id
          }
          location: assignedLocation {
            location {
              id
              isPresale: metafield(namespace: "custom", key: "pre_sale") {
                value
              }
            }
          }
        }
      }
    }
  }
`;
const ORDER_EDIT_MUTATION = `
  mutation orderEditBegin($id: ID!) {
    orderEditBegin(id: $id) {
      calculatedOrder {
        id
        calculatedLineItems(first: 50) {
          nodes {
            id
            quantity
            lineItem {
              id
            }
          }
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;
const ORDER_EDIT_COMMIT_MUTATION = `
  mutation orderEditCommit($id: ID!, $notifyCustomer: Boolean, $staffNote: String) {
    orderEditCommit(id: $id, notifyCustomer: $notifyCustomer, staffNote: $staffNote) {
      order {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;
const ORDER_EDIT_SET_QUANTITY_MUTATION = `
  mutation orderEditSetQuantity($id: ID!, $lineItemId: ID!, $quantity: Int!) {
    orderEditSetQuantity(id: $id, lineItemId: $lineItemId, quantity: $quantity) {
      calculatedLineItem {
        id
        quantity
      }
      userErrors {
        field
        message
      }
    }
  }
`;
const ORDER_EDIT_REMOVE_LINEITEM_MUTATION = `
  mutation orderEditRemoveLineItem($id: ID!, $lineItemId: ID!) {
    orderEditRemoveLineItem(id: $id, lineItemId: $lineItemId) {
      calculatedLineItems {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;
const TAGS_ADD_MUTATION = `
  mutation tagsAdd($id: ID!, $tags: [String!]!) {
    tagsAdd(id: $id, tags: $tags) {
      node {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;
const METAFIELD_UPSERT_MUTATION = `
  mutation metafieldUpsert($ownerId: ID!, $namespace: String!, $key: String!, $value: String!, $type: String!) {
    metafieldUpsert(ownerId: $ownerId, namespace: $namespace, key: $key, value: $value, type: $type) {
      metafield {
        id
        key
        value
      }
      userErrors {
        field
        message
      }
    }
  }
`;
const CREATE_ORDER_MUTATION = `
  mutation draftOrderCreate($input: DraftOrderInput!) {
    draftOrderCreate(input: $input) {
      draftOrder {
        id
        order {
          id
          name
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;
const DRAFT_ORDER_COMPLETE_MUTATION = `
  mutation draftOrderComplete($id: ID!) {
    draftOrderComplete(id: $id) {
      draftOrder {
        id
        order {
          id
          name
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;
function clampString(input2, max = 2e3) {
  if (input2 == null) return "";
  const s = String(input2);
  return s.length > max ? s.slice(0, max) : s;
}
function sanitizeOrderId(id) {
  if (id == null) throw new Error("Missing order id in webhook payload");
  const s = String(id).trim();
  if (!/^\d+$/.test(s)) {
    throw new Error("Invalid order id");
  }
  return s;
}
function sanitizeCustomerId(id) {
  if (id == null) return null;
  const s = String(id).trim();
  if (!/^\d+$/.test(s)) return null;
  return s;
}
function sanitizeShippingAddress(addr) {
  if (!addr || typeof addr !== "object") return null;
  const get = (keys, max = 250) => {
    for (const k of keys) {
      if (addr[k]) return clampString(addr[k], max);
    }
    return void 0;
  };
  return {
    firstName: get(["first_name", "firstName"], 100) || void 0,
    lastName: get(["last_name", "lastName"], 100) || void 0,
    address1: get(["address1"], 250) || void 0,
    address2: get(["address2"], 250) || void 0,
    city: get(["city"], 100) || void 0,
    province: get(["province"], 100) || void 0,
    country: get(["country"], 100) || void 0,
    zip: get(["zip", "postal_code"], 50) || void 0,
    phone: get(["phone"], 50) || void 0
  };
}
async function graphqlWithRetry(admin, query, opts = {}, maxRetries = 3) {
  var _a2;
  let attempt = 0;
  while (true) {
    try {
      const resp = await admin.graphql(query, opts);
      const status = resp == null ? void 0 : resp.status;
      const data = await resp.json();
      if (status === 429 || status && status >= 500) {
        throw new Error(`HTTP ${status}`);
      }
      if (data == null ? void 0 : data.errors) {
        const asString = JSON.stringify(data.errors).toLowerCase();
        if (asString.includes("rate") || asString.includes("throttle") || asString.includes("throttled")) {
          throw new Error("GraphQL rate limit");
        }
      }
      return data;
    } catch (err) {
      attempt++;
      if (attempt > maxRetries) {
        console.error(`graphqlWithRetry failed after ${attempt} attempts:`, err.message);
        try {
          const shopForAlert = (_a2 = opts == null ? void 0 : opts.meta) == null ? void 0 : _a2.shop;
          if (shopForAlert) {
            await db$1.splitLog.create({
              data: {
                shop: shopForAlert,
                originalOrderId: null,
                splitOrderIds: null,
                retained: false,
                message: `GraphQL retry failure: ${err.message}`
              }
            });
          }
        } catch (dbErr) {
          console.warn("Failed to write GraphQL retry alert to DB:", dbErr.message);
        }
        throw err;
      }
      const delay = Math.pow(2, attempt) * 1e3 + Math.floor(Math.random() * 1e3);
      console.warn(`GraphQL attempt ${attempt} failed, retrying after ${delay}ms:`, err.message);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}
const action$2 = async ({
  request
}) => {
  var _a2, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _A, _B, _C, _D;
  const {
    topic,
    shop,
    admin,
    payload
  } = await authenticate.webhook(request);
  if (topic !== "ORDERS_CREATE") {
    throw new Response("Unhandled webhook topic", {
      status: 404
    });
  }
  console.log("--- Order Create Webhook Received ---");
  console.log("Shop:", shop);
  console.log("Payload Order ID:", payload.id);
  try {
    const settings = await db$1.appSettings.findUnique({
      where: {
        shop
      }
    });
    if (!(settings == null ? void 0 : settings.splittingEnabled)) {
      console.log("Order splitting is disabled for this shop.");
      return new Response(JSON.stringify({
        message: "Splitting disabled."
      }));
    }
    const orderId = sanitizeOrderId(payload.id);
    const orderGid = `gid://shopify/Order/${orderId}`;
    const customerId = sanitizeCustomerId((_a2 = payload == null ? void 0 : payload.customer) == null ? void 0 : _a2.id);
    const sanitizedShipping = sanitizeShippingAddress(payload == null ? void 0 : payload.shipping_address);
    const orderRespData = await graphqlWithRetry(admin, GET_ORDER_DETAILS_QUERY, {
      variables: {
        id: orderGid
      },
      meta: {
        shop
      }
    });
    const order = (_b = orderRespData == null ? void 0 : orderRespData.data) == null ? void 0 : _b.order;
    if (!order) {
      throw new Error("Order not found.");
    }
    const existingTags = order.tags || [];
    const metafields = (((_c = order.metafields) == null ? void 0 : _c.edges) || []).map((e) => e.node) || [];
    const hasSplitId = metafields.find((mf) => mf.namespace === "custom" && mf.key === "split_id");
    if (existingTags.includes("split-processed") || existingTags.includes("pre-sale-retained") || hasSplitId) {
      console.log(`Order ${order.name} already processed or has split_id.`);
      return new Response(JSON.stringify({
        message: "Order already processed."
      }));
    }
    if (order.displayFinancialStatus !== "PAID") {
      console.log(`Order ${order.name} is not fully paid.`);
      try {
        await graphqlWithRetry(admin, TAGS_ADD_MUTATION, {
          variables: {
            id: orderGid,
            tags: ["order-not-paid"]
          },
          meta: {
            shop
          }
        });
      } catch (tagErr) {
        console.warn("Failed to tag unpaid order:", tagErr.message);
      }
      try {
        await db$1.splitLog.create({
          data: {
            shop,
            originalOrderId: clampString(order.name, 255),
            splitOrderIds: null,
            retained: true,
            message: clampString("Order not paid.", 1e3)
          }
        });
      } catch (dbErr) {
        console.warn("Failed to write unpaid order to DB:", dbErr.message);
      }
      return new Response(JSON.stringify({
        message: "Order not paid."
      }));
    }
    const lineItems = order.lineItems.nodes;
    const presaleItems = [];
    const nonPresaleItems = [];
    lineItems.forEach((item) => {
      var _a3, _b2;
      if (((_b2 = (_a3 = item.location) == null ? void 0 : _a3.isPresale) == null ? void 0 : _b2.value) === "true") {
        presaleItems.push(item);
      } else {
        nonPresaleItems.push(item);
      }
    });
    if (presaleItems.length === 0 || presaleItems.length === lineItems.length) {
      const tag = presaleItems.length === 0 ? "no-presale-items" : "pre-sale-retained";
      await admin.graphql(TAGS_ADD_MUTATION, {
        variables: {
          id: orderGid,
          tags: [tag]
        }
      });
      const splitId2 = `split_${Date.now()}`;
      await admin.graphql(METAFIELD_UPSERT_MUTATION, {
        variables: {
          ownerId: orderGid,
          namespace: "custom",
          key: "split_id",
          value: splitId2,
          type: "single_line_text_field"
        }
      });
      await db$1.splitLog.create({
        data: {
          shop,
          originalOrderId: clampString(order.name, 255),
          retained: true,
          message: clampString(presaleItems.length === 0 ? "No pre-sale items in order." : "All items are pre-sale; order retained.", 1e3)
        }
      });
      console.log(`Order ${order.name} retained. Reason: ${tag}`);
      return new Response(JSON.stringify({
        message: "Order retained."
      }));
    }
    console.log(`Splitting order ${order.name}...`);
    const presaleGroups = {};
    for (const item of presaleItems) {
      const locationCode = ((_e = (_d = item.variant) == null ? void 0 : _d.locationCode) == null ? void 0 : _e.value) || "DEFAULT";
      if (!presaleGroups[locationCode]) {
        presaleGroups[locationCode] = [];
      }
      presaleGroups[locationCode].push(item);
    }
    const locationMappings = await db$1.locationMapping.findMany({
      where: {
        shop
      }
    });
    const missingMappings = [];
    const mappingDict = locationMappings.reduce((acc, map) => {
      acc[map.locationCode] = map.locationGid;
      return acc;
    }, {});
    const splitOrderIds = [];
    const splitCreationErrors = [];
    try {
      for (const locationCode in presaleGroups) {
        const items = presaleGroups[locationCode];
        const locationId = mappingDict[locationCode];
        if (!locationId) {
          console.warn(`No location mapping found for code: ${locationCode}. Skipping split.`);
          missingMappings.push(locationCode);
          continue;
        }
        const draftInput = {
          lineItems: items.map((item) => ({
            variantId: item.variant.id,
            quantity: item.quantity
          })),
          shippingAddress: sanitizedShipping || void 0,
          customer: customerId ? {
            id: `gid://shopify/Customer/${customerId}`
          } : void 0,
          tags: ["split-child"],
          // You may want to set a note or metafields on the draft to record origin
          note: clampString(`Split from ${clampString(order.name, 200)} for location ${locationCode}`, 500)
        };
        try {
          const createData = await graphqlWithRetry(admin, CREATE_ORDER_MUTATION, {
            variables: {
              input: draftInput
            },
            meta: {
              shop
            }
          });
          const createErrors = ((_g = (_f = createData == null ? void 0 : createData.data) == null ? void 0 : _f.draftOrderCreate) == null ? void 0 : _g.userErrors) || [];
          if (createErrors.length) {
            console.error("Draft order create errors:", createErrors);
            continue;
          }
          const draftOrder = (_i = (_h = createData == null ? void 0 : createData.data) == null ? void 0 : _h.draftOrderCreate) == null ? void 0 : _i.draftOrder;
          if (!(draftOrder == null ? void 0 : draftOrder.id)) {
            console.error("Draft order not returned, skipping", createData);
            continue;
          }
          const completeData = await graphqlWithRetry(admin, DRAFT_ORDER_COMPLETE_MUTATION, {
            variables: {
              id: draftOrder.id
            },
            meta: {
              shop
            }
          });
          const completeErrors = ((_k = (_j = completeData == null ? void 0 : completeData.data) == null ? void 0 : _j.draftOrderComplete) == null ? void 0 : _k.userErrors) || [];
          if (completeErrors.length) {
            console.error("Draft order complete errors:", completeErrors);
          }
          const createdOrder = ((_n = (_m = (_l = completeData == null ? void 0 : completeData.data) == null ? void 0 : _l.draftOrderComplete) == null ? void 0 : _m.draftOrder) == null ? void 0 : _n.order) || (draftOrder == null ? void 0 : draftOrder.order);
          const createdOrderId = (createdOrder == null ? void 0 : createdOrder.id) || draftOrder.id;
          const createdOrderName = (createdOrder == null ? void 0 : createdOrder.name) || ((_o = draftOrder == null ? void 0 : draftOrder.order) == null ? void 0 : _o.name) || `${order.name}-P${splitOrderIds.length + 1}`;
          console.log("--- Created order:", createdOrderName, createdOrderId, "---");
          splitOrderIds.push(createdOrderId);
          console.log("Recorded split order id:", createdOrderId);
        } catch (err) {
          console.error("Error creating/completing split order for", locationCode, err);
          continue;
        }
      }
    } catch (err) {
      console.error("Unexpected error during split order creation:", err);
      splitCreationErrors.push(String(err));
    }
    console.log("Split orders created:", splitOrderIds);
    if (splitCreationErrors.length) {
      console.warn("Split creation had errors:", splitCreationErrors);
    }
    try {
      const orderEditBeginResponse = await admin.graphql(ORDER_EDIT_MUTATION, {
        variables: {
          id: orderGid
        }
      });
      const editBeginData = await orderEditBeginResponse.json();
      const editBeginErrors = ((_q = (_p = editBeginData == null ? void 0 : editBeginData.data) == null ? void 0 : _p.orderEditBegin) == null ? void 0 : _q.userErrors) || [];
      if (editBeginErrors.length) {
        throw new Error("Failed to begin order edit: " + JSON.stringify(editBeginErrors));
      }
      const calculatedOrderId = (_t = (_s = (_r = editBeginData == null ? void 0 : editBeginData.data) == null ? void 0 : _r.orderEditBegin) == null ? void 0 : _s.calculatedOrder) == null ? void 0 : _t.id;
      if (!calculatedOrderId) {
        throw new Error("No calculatedOrder id returned from orderEditBegin");
      }
      const calculatedLines = ((_x = (_w = (_v = (_u = editBeginData == null ? void 0 : editBeginData.data) == null ? void 0 : _u.orderEditBegin) == null ? void 0 : _v.calculatedOrder) == null ? void 0 : _w.calculatedLineItems) == null ? void 0 : _x.nodes) || [];
      const findCalculatedForOriginal = (originalLineItemId) => {
        return calculatedLines.find((cl) => {
          var _a3;
          return ((_a3 = cl.lineItem) == null ? void 0 : _a3.id) === originalLineItemId;
        });
      };
      for (const presaleItem of presaleItems) {
        const originalLineId = presaleItem.id;
        const calculated = findCalculatedForOriginal(originalLineId);
        if (!calculated) {
          console.warn(`Could not find calculated line for original line ${originalLineId}. Skipping adjustment.`);
          continue;
        }
        const originalQty = presaleItem.quantity;
        const calcQty = calculated.quantity;
        try {
          if (calcQty <= originalQty) {
            const removeData = await graphqlWithRetry(admin, ORDER_EDIT_REMOVE_LINEITEM_MUTATION, {
              variables: {
                id: calculatedOrderId,
                lineItemId: calculated.id
              },
              meta: {
                shop
              }
            });
            const removeErrors = ((_z = (_y = removeData == null ? void 0 : removeData.data) == null ? void 0 : _y.orderEditRemoveLineItem) == null ? void 0 : _z.userErrors) || [];
            if (removeErrors.length) {
              console.error("Failed to remove calculated line:", removeErrors);
            }
          } else {
            const newQty = calcQty - originalQty;
            const setData = await graphqlWithRetry(admin, ORDER_EDIT_SET_QUANTITY_MUTATION, {
              variables: {
                id: calculatedOrderId,
                lineItemId: calculated.id,
                quantity: newQty
              },
              meta: {
                shop
              }
            });
            const setErrors = ((_B = (_A = setData == null ? void 0 : setData.data) == null ? void 0 : _A.orderEditSetQuantity) == null ? void 0 : _B.userErrors) || [];
            if (setErrors.length) {
              console.error("Failed to set quantity on calculated line:", setErrors);
            }
          }
        } catch (err) {
          console.error("Error adjusting calculated line for", originalLineId, err);
          continue;
        }
      }
      const commitData = await graphqlWithRetry(admin, ORDER_EDIT_COMMIT_MUTATION, {
        variables: {
          id: calculatedOrderId,
          notifyCustomer: false,
          staffNote: "Order split: pre-sale items removed"
        },
        meta: {
          shop
        }
      });
      const commitErrors = ((_D = (_C = commitData == null ? void 0 : commitData.data) == null ? void 0 : _C.orderEditCommit) == null ? void 0 : _D.userErrors) || [];
      if (commitErrors.length) {
        throw new Error("Failed to commit order edit: " + JSON.stringify(commitErrors));
      }
    } catch (err) {
      console.error("Order edit failed for original order:", err);
    }
    try {
      await graphqlWithRetry(admin, TAGS_ADD_MUTATION, {
        variables: {
          id: orderGid,
          tags: ["split-processed"]
        },
        meta: {
          shop
        }
      });
    } catch (tagErr) {
      console.warn("Failed to tag original order as split-processed:", tagErr.message);
    }
    const splitId = `split_${Date.now()}`;
    try {
      await graphqlWithRetry(admin, METAFIELD_UPSERT_MUTATION, {
        variables: {
          ownerId: orderGid,
          namespace: "custom",
          key: "split_id",
          value: splitId,
          type: "single_line_text_field"
        },
        meta: {
          shop
        }
      });
    } catch (mfErr) {
      console.warn("Failed to upsert split_id metafield:", mfErr.message);
    }
    await db$1.splitLog.create({
      data: {
        shop,
        originalOrderId: clampString(order.name, 255),
        splitOrderIds: clampString(splitOrderIds.join(","), 1e3),
        retained: false,
        message: clampString(`Order split into ${splitOrderIds.length} new orders.`, 1e3)
      }
    });
    console.log(`Order ${order.name} processed successfully.`);
    return new Response(JSON.stringify({
      success: true
    }));
  } catch (error) {
    console.error("--- Webhook Processing Error ---");
    console.error(error);
    return new Response("Internal Server Error", {
      status: 500
    });
  }
};
const route3 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$2
}, Symbol.toStringTag, { value: "Module" }));
function loginErrorMessage(loginErrors) {
  if ((loginErrors == null ? void 0 : loginErrors.shop) === LoginErrorType.MissingShop) {
    return { shop: "Please enter your shop domain to log in" };
  } else if ((loginErrors == null ? void 0 : loginErrors.shop) === LoginErrorType.InvalidShop) {
    return { shop: "Please enter a valid shop domain to log in" };
  }
  return {};
}
const loader$5 = async ({
  request
}) => {
  const errors = loginErrorMessage(await login(request));
  return {
    errors
  };
};
const action$1 = async ({
  request
}) => {
  const errors = loginErrorMessage(await login(request));
  return {
    errors
  };
};
const route$1 = UNSAFE_withComponentProps(function Auth() {
  const loaderData = useLoaderData();
  const actionData = useActionData();
  const [shop, setShop] = useState("");
  const {
    errors
  } = actionData || loaderData;
  return /* @__PURE__ */ jsx(AppProvider$1, {
    embedded: false,
    children: /* @__PURE__ */ jsx("s-page", {
      children: /* @__PURE__ */ jsx(Form, {
        method: "post",
        children: /* @__PURE__ */ jsxs("s-section", {
          heading: "Log in",
          children: [/* @__PURE__ */ jsx("s-text-field", {
            name: "shop",
            label: "Shop domain",
            details: "example.myshopify.com",
            value: shop,
            onChange: (e) => setShop(e.currentTarget.value),
            autocomplete: "on",
            error: errors.shop
          }), /* @__PURE__ */ jsx("s-button", {
            type: "submit",
            children: "Log in"
          })]
        })
      })
    })
  });
});
const route4 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$1,
  default: route$1,
  loader: loader$5
}, Symbol.toStringTag, { value: "Module" }));
const loader$4 = async ({
  request
}) => {
  await authenticate.admin(request);
  return null;
};
const headers$1 = (headersArgs) => {
  return boundary.headers(headersArgs);
};
const route5 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  headers: headers$1,
  loader: loader$4
}, Symbol.toStringTag, { value: "Module" }));
const index = "_index_1hqgz_1";
const heading = "_heading_1hqgz_21";
const text = "_text_1hqgz_23";
const content = "_content_1hqgz_43";
const form = "_form_1hqgz_53";
const label = "_label_1hqgz_69";
const input = "_input_1hqgz_85";
const button = "_button_1hqgz_93";
const list = "_list_1hqgz_101";
const styles = {
  index,
  heading,
  text,
  content,
  form,
  label,
  input,
  button,
  list
};
const loader$3 = async ({
  request
}) => {
  const url = new URL(request.url);
  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }
  return {
    showForm: Boolean(login)
  };
};
const route = UNSAFE_withComponentProps(function App2() {
  const {
    showForm
  } = useLoaderData();
  return /* @__PURE__ */ jsx("div", {
    className: styles.index,
    children: /* @__PURE__ */ jsxs("div", {
      className: styles.content,
      children: [/* @__PURE__ */ jsx("h1", {
        className: styles.heading,
        children: "A short heading about [your app]"
      }), /* @__PURE__ */ jsx("p", {
        className: styles.text,
        children: "A tagline about [your app] that describes your value proposition."
      }), showForm && /* @__PURE__ */ jsxs(Form, {
        className: styles.form,
        method: "post",
        action: "/auth/login",
        children: [/* @__PURE__ */ jsxs("label", {
          className: styles.label,
          children: [/* @__PURE__ */ jsx("span", {
            children: "Shop domain"
          }), /* @__PURE__ */ jsx("input", {
            className: styles.input,
            type: "text",
            name: "shop"
          }), /* @__PURE__ */ jsx("span", {
            children: "e.g: my-shop-domain.myshopify.com"
          })]
        }), /* @__PURE__ */ jsx("button", {
          className: styles.button,
          type: "submit",
          children: "Log in"
        })]
      }), /* @__PURE__ */ jsxs("ul", {
        className: styles.list,
        children: [/* @__PURE__ */ jsxs("li", {
          children: [/* @__PURE__ */ jsx("strong", {
            children: "Product feature"
          }), ". Some detail about your feature and its benefit to your customer."]
        }), /* @__PURE__ */ jsxs("li", {
          children: [/* @__PURE__ */ jsx("strong", {
            children: "Product feature"
          }), ". Some detail about your feature and its benefit to your customer."]
        }), /* @__PURE__ */ jsxs("li", {
          children: [/* @__PURE__ */ jsx("strong", {
            children: "Product feature"
          }), ". Some detail about your feature and its benefit to your customer."]
        })]
      })]
    })
  });
});
const route6 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: route,
  loader: loader$3
}, Symbol.toStringTag, { value: "Module" }));
const loader$2 = async ({
  request
}) => {
  await authenticate.admin(request);
  return {
    apiKey: process.env.SHOPIFY_API_KEY || ""
  };
};
const app = UNSAFE_withComponentProps(function App3() {
  const {
    apiKey
  } = useLoaderData();
  return /* @__PURE__ */ jsxs(AppProvider$1, {
    embedded: true,
    apiKey,
    children: [/* @__PURE__ */ jsxs("ui-nav-menu", {
      children: [/* @__PURE__ */ jsx(Link, {
        to: "/app",
        rel: "home",
        children: "Home"
      }), /* @__PURE__ */ jsx(Link, {
        to: "/app/additional",
        children: "Additional page"
      })]
    }), /* @__PURE__ */ jsx(Outlet, {})]
  });
});
const ErrorBoundary = UNSAFE_withErrorBoundaryProps(function ErrorBoundary2() {
  return boundary.error(useRouteError());
});
const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
const route7 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  ErrorBoundary,
  default: app,
  headers,
  loader: loader$2
}, Symbol.toStringTag, { value: "Module" }));
const app_additional = UNSAFE_withComponentProps(function AdditionalPage() {
  return /* @__PURE__ */ jsxs("s-page", {
    children: [/* @__PURE__ */ jsx("ui-title-bar", {
      title: "Additional page"
    }), /* @__PURE__ */ jsxs("s-section", {
      heading: "Multiple pages",
      children: [/* @__PURE__ */ jsxs("s-paragraph", {
        children: ["The app template comes with an additional page which demonstrates how to create multiple pages within app navigation using", " ", /* @__PURE__ */ jsx("s-link", {
          href: "https://shopify.dev/docs/apps/tools/app-bridge",
          target: "_blank",
          children: "App Bridge"
        }), "."]
      }), /* @__PURE__ */ jsxs("s-paragraph", {
        children: ["To create your own page and have it show up in the app navigation, add a page inside ", /* @__PURE__ */ jsx("code", {
          children: "app/routes"
        }), ", and a link to it in the", " ", /* @__PURE__ */ jsx("code", {
          children: "<ui-nav-menu>"
        }), " component found in", " ", /* @__PURE__ */ jsx("code", {
          children: "app/routes/app.jsx"
        }), "."]
      })]
    }), /* @__PURE__ */ jsx("s-section", {
      slot: "aside",
      heading: "Resources",
      children: /* @__PURE__ */ jsx("s-unordered-list", {
        children: /* @__PURE__ */ jsx("s-list-item", {
          children: /* @__PURE__ */ jsx("s-link", {
            href: "https://shopify.dev/docs/apps/design-guidelines/navigation#app-nav",
            target: "_blank",
            children: "App nav best practices"
          })
        })
      })
    })]
  });
});
const route8 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: app_additional
}, Symbol.toStringTag, { value: "Module" }));
const loader$1 = async ({
  request
}) => {
  var _a2, _b;
  const {
    admin,
    session
  } = await authenticate.admin(request);
  const {
    shop
  } = session;
  const settings = await db$1.appSettings.upsert({
    where: {
      shop
    },
    update: {},
    create: {
      shop,
      splittingEnabled: true
    }
  });
  const mappings = await db$1.locationMapping.findMany({
    where: {
      shop
    }
  });
  const locationsResponse = await admin.graphql(`#graphql
      query {
        locations(first: 20) {
          edges {
            node {
              id
              name
            }
          }
        }
      }`);
  let locations = [];
  try {
    const locationsData = await locationsResponse.json();
    locations = (((_b = (_a2 = locationsData == null ? void 0 : locationsData.data) == null ? void 0 : _a2.locations) == null ? void 0 : _b.edges) || []).map((edge) => edge.node);
  } catch (err) {
    console.error("Failed to fetch locations from Shopify:", err);
    locations = [];
  }
  return json({
    shop,
    settings: settings || {
      splittingEnabled: false
    },
    mappings: mappings || [],
    locations
  });
};
const action = async ({
  request
}) => {
  const {
    admin,
    session
  } = await authenticate.admin(request);
  const {
    shop
  } = session;
  const formData = await request.formData();
  const action2 = formData.get("_action");
  if (action2 === "updateSettings") {
    const splittingEnabled = formData.get("splittingEnabled") === "true";
    await db$1.appSettings.update({
      where: {
        shop
      },
      data: {
        splittingEnabled
      }
    });
    return json({
      success: true,
      message: "Settings updated."
    });
  }
  if (action2 === "addMapping") {
    const locationCode = formData.get("locationCode");
    const locationGid = formData.get("locationGid");
    if (locationCode && locationGid) {
      await db$1.locationMapping.create({
        data: {
          shop,
          locationCode,
          locationGid
        }
      });
    }
    return json({
      success: true,
      message: "Mapping added."
    });
  }
  if (action2 === "deleteMapping") {
    const id = parseInt(formData.get("id"), 10);
    await db$1.locationMapping.delete({
      where: {
        id
      }
    });
    return json({
      success: true,
      message: "Mapping deleted."
    });
  }
  if (action2 === "togglePresaleLocation") {
    const locationGid = formData.get("locationGid");
    const isPresale = formData.get("isPresale") === "true";
    if (locationGid) {
      const METAFIELD_UPSERT = `
        mutation metafieldUpsert($ownerId: ID!, $namespace: String!, $key: String!, $value: String!, $type: String!) {
          metafieldUpsert(ownerId: $ownerId, namespace: $namespace, key: $key, value: $value, type: $type) {
            metafield { id }
            userErrors { field message }
          }
        }
      `;
      await admin.graphql(METAFIELD_UPSERT, {
        variables: {
          ownerId: locationGid,
          namespace: "custom",
          key: "pre_sale",
          value: isPresale ? "true" : "false",
          type: "single_line_text_field"
        }
      });
    }
    return json({
      success: true,
      message: "Location pre-sale status updated."
    });
  }
  return json({
    success: false,
    message: "Invalid action."
  });
};
const AppSettings = UNSAFE_withComponentProps(function AppSettings2() {
  var _a2;
  const submit = useSubmit();
  const loaderData = useLoaderData() || {};
  const {
    settings = {
      splittingEnabled: false
    },
    mappings = [],
    locations = []
  } = loaderData;
  const [splittingEnabled, setSplittingEnabled] = useState(Boolean(settings.splittingEnabled));
  const [newCode, setNewCode] = useState("");
  const [selectedLocation, setSelectedLocation] = useState(((_a2 = locations[0]) == null ? void 0 : _a2.id) || "");
  const handleSaveSettings = () => {
    const formData = new FormData();
    formData.append("_action", "updateSettings");
    formData.append("splittingEnabled", splittingEnabled ? "true" : "false");
    submit(formData, {
      method: "post"
    });
  };
  const handleAddMapping = () => {
    const formData = new FormData();
    formData.append("_action", "addMapping");
    formData.append("locationCode", newCode);
    formData.append("locationGid", selectedLocation);
    submit(formData, {
      method: "post"
    });
    setNewCode("");
  };
  const locationOptions = locations.map((loc) => ({
    label: loc.name,
    value: loc.id
  }));
  return /* @__PURE__ */ jsxs(BlockStack, {
    gap: "500",
    children: [/* @__PURE__ */ jsx(Card, {
      children: /* @__PURE__ */ jsxs(BlockStack, {
        gap: "500",
        children: [/* @__PURE__ */ jsx(Text, {
          as: "h2",
          variant: "headingMd",
          children: "General Settings"
        }), /* @__PURE__ */ jsx(ChoiceList, {
          title: "Order Splitting",
          choices: [{
            label: "Enable order splitting logic",
            value: "true"
          }],
          selected: splittingEnabled ? ["true"] : [],
          onChange: (value) => setSplittingEnabled(value.includes("true"))
        }), /* @__PURE__ */ jsx(Button, {
          onClick: handleSaveSettings,
          variant: "primary",
          children: "Save Settings"
        })]
      })
    }), /* @__PURE__ */ jsx(Card, {
      children: /* @__PURE__ */ jsxs(BlockStack, {
        gap: "500",
        children: [/* @__PURE__ */ jsx(Text, {
          as: "h2",
          variant: "headingMd",
          children: "Location Mappings"
        }), /* @__PURE__ */ jsx(Text, {
          children: "Map your product/variant `location_code` metafields to Shopify inventory locations."
        }), /* @__PURE__ */ jsxs(FormLayout, {
          children: [/* @__PURE__ */ jsxs(FormLayout.Group, {
            children: [/* @__PURE__ */ jsx(TextField, {
              label: "Location Code",
              value: newCode,
              onChange: setNewCode,
              autoComplete: "off",
              placeholder: "e.g., NY-WAREHOUSE"
            }), /* @__PURE__ */ jsx(Select, {
              label: "Shopify Location",
              options: locationOptions,
              onChange: setSelectedLocation,
              value: selectedLocation
            })]
          }), /* @__PURE__ */ jsx(Button, {
            onClick: handleAddMapping,
            disabled: !newCode || !selectedLocation,
            children: "Add Mapping"
          })]
        }), /* @__PURE__ */ jsxs(BlockStack, {
          gap: "200",
          children: [mappings.map((map) => {
            var _a3;
            return /* @__PURE__ */ jsxs(LegacyStack, {
              alignment: "center",
              distribution: "equalSpacing",
              children: [/* @__PURE__ */ jsxs(Text, {
                children: [map.locationCode, " →", " ", ((_a3 = locations.find((l) => l.id === map.locationGid)) == null ? void 0 : _a3.name) || map.locationGid]
              }), /* @__PURE__ */ jsxs(Form, {
                method: "post",
                children: [/* @__PURE__ */ jsx("input", {
                  type: "hidden",
                  name: "_action",
                  value: "deleteMapping"
                }), /* @__PURE__ */ jsx("input", {
                  type: "hidden",
                  name: "id",
                  value: map.id
                }), /* @__PURE__ */ jsx(Button, {
                  submit: true,
                  variant: "tertiary",
                  children: "Delete"
                })]
              })]
            }, map.id);
          }), /* @__PURE__ */ jsx(Text, {
            as: "h3",
            variant: "headingSm",
            children: "Shopify Locations"
          }), locations.map((loc) => /* @__PURE__ */ jsxs(LegacyStack, {
            alignment: "center",
            distribution: "equalSpacing",
            children: [/* @__PURE__ */ jsx(Text, {
              children: loc.name
            }), /* @__PURE__ */ jsxs(Form, {
              method: "post",
              children: [/* @__PURE__ */ jsx("input", {
                type: "hidden",
                name: "_action",
                value: "togglePresaleLocation"
              }), /* @__PURE__ */ jsx("input", {
                type: "hidden",
                name: "locationGid",
                value: loc.id
              }), /* @__PURE__ */ jsx("input", {
                type: "hidden",
                name: "isPresale",
                value: "false"
              }), /* @__PURE__ */ jsx(Button, {
                submit: true,
                variant: "secondary",
                children: "Mark Pre-Sale"
              })]
            })]
          }, loc.id))]
        })]
      })
    })]
  });
});
const route9 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action,
  default: AppSettings,
  loader: loader$1
}, Symbol.toStringTag, { value: "Module" }));
const LOGS_PER_PAGE = 10;
const loader = async ({
  request
}) => {
  const {
    session
  } = await authenticate.admin(request);
  const {
    shop
  } = session;
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1", 10);
  const skip = (page - 1) * LOGS_PER_PAGE;
  const logs = await db$1.splitLog.findMany({
    where: {
      shop
    },
    orderBy: {
      createdAt: "desc"
    },
    take: LOGS_PER_PAGE,
    skip
  });
  const logCount = await db$1.splitLog.count({
    where: {
      shop
    }
  });
  return json({
    logs,
    page,
    logCount,
    totalPages: Math.ceil(logCount / LOGS_PER_PAGE)
  });
};
const AppLogs = UNSAFE_withComponentProps(function AppLogs2() {
  const {
    logs,
    page,
    totalPages
  } = useLoaderData();
  const rows = logs.map((log) => [log.originalOrderId, log.splitOrderIds || "N/A", log.message, format(new Date(log.createdAt), "yyyy-MM-dd hh:mm a")]);
  return /* @__PURE__ */ jsx(Card, {
    children: /* @__PURE__ */ jsxs(BlockStack, {
      gap: "500",
      children: [/* @__PURE__ */ jsx(Text, {
        as: "h2",
        variant: "headingMd",
        children: "Action Logs"
      }), /* @__PURE__ */ jsx(DataTable, {
        columnContentTypes: ["text", "text", "text", "text"],
        headings: ["Original Order", "Split Orders", "Action/Message", "Timestamp"],
        rows
      }), totalPages > 1 && /* @__PURE__ */ jsx(Pagination, {
        hasPrevious: page > 1,
        onPrevious: () => {
        },
        hasNext: page < totalPages,
        onNext: () => {
        }
      })]
    })
  });
});
const route11 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: AppLogs,
  loader
}, Symbol.toStringTag, { value: "Module" }));
const app__index = UNSAFE_withComponentProps(function Index() {
  const navigate = useNavigate();
  const location = useLocation();
  const selectedTab = location.pathname.includes("/logs") ? 1 : 0;
  const handleTabChange = useCallback((selectedTabIndex) => {
    const path = selectedTabIndex === 0 ? "/app" : "/app/logs";
    navigate(path);
  }, [navigate]);
  const tabs = [{
    id: "settings",
    content: "Settings",
    panelID: "settings-panel"
  }, {
    id: "logs",
    content: "Logs",
    panelID: "logs-panel"
  }];
  return /* @__PURE__ */ jsx(Page, {
    title: "Order Splitter",
    children: /* @__PURE__ */ jsxs(Tabs, {
      tabs,
      selected: selectedTab,
      onSelect: handleTabChange,
      children: [selectedTab === 0 && /* @__PURE__ */ jsx(AppSettings, {}), selectedTab === 1 && /* @__PURE__ */ jsx(AppLogs, {})]
    })
  });
});
const route10 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: app__index
}, Symbol.toStringTag, { value: "Module" }));
const serverManifest = { "entry": { "module": "/assets/entry.client-DN_U5KKa.js", "imports": ["/assets/chunk-NISHYRIK-C6H48Nd1.js", "/assets/index-Cg0tdoWy.js"], "css": [] }, "routes": { "root": { "id": "root", "parentId": void 0, "path": "", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/root-xhs0lelm.js", "imports": ["/assets/chunk-NISHYRIK-C6H48Nd1.js", "/assets/index-Cg0tdoWy.js", "/assets/use-is-after-initial-mount-BFIEK1BH.js", "/assets/context-BMVwFbqw.js", "/assets/context-DPdHSVAu.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/webhooks.app.scopes_update": { "id": "routes/webhooks.app.scopes_update", "parentId": "root", "path": "webhooks/app/scopes_update", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/webhooks.app.scopes_update-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/webhooks.app.uninstalled": { "id": "routes/webhooks.app.uninstalled", "parentId": "root", "path": "webhooks/app/uninstalled", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/webhooks.app.uninstalled-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/webhooks.orders-create": { "id": "routes/webhooks.orders-create", "parentId": "root", "path": "webhooks/orders-create", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/webhooks.orders-create-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/auth.login": { "id": "routes/auth.login", "parentId": "root", "path": "auth/login", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/route-BHuY1G19.js", "imports": ["/assets/chunk-NISHYRIK-C6H48Nd1.js", "/assets/AppProxyProvider-Bwpa2jKI.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/auth.$": { "id": "routes/auth.$", "parentId": "root", "path": "auth/*", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/auth._-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/_index": { "id": "routes/_index", "parentId": "root", "path": void 0, "index": true, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/route-Bl_0Rx4m.js", "imports": ["/assets/chunk-NISHYRIK-C6H48Nd1.js"], "css": ["/assets/route-Cnm7FvdT.css"], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app": { "id": "routes/app", "parentId": "root", "path": "app", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": true, "module": "/assets/app-DfTcPtvo.js", "imports": ["/assets/chunk-NISHYRIK-C6H48Nd1.js", "/assets/AppProxyProvider-Bwpa2jKI.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app.additional": { "id": "routes/app.additional", "parentId": "routes/app", "path": "additional", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/app.additional-eUKk0YqX.js", "imports": ["/assets/chunk-NISHYRIK-C6H48Nd1.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app.settings": { "id": "routes/app.settings", "parentId": "routes/app", "path": "settings", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/app.settings-KfdeRsfg.js", "imports": ["/assets/app.settings-DT-tHRjK.js", "/assets/chunk-NISHYRIK-C6H48Nd1.js", "/assets/components-UtzYwED0.js", "/assets/use-is-after-initial-mount-BFIEK1BH.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app._index": { "id": "routes/app._index", "parentId": "routes/app", "path": void 0, "index": true, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/app._index-BekdJDcG.js", "imports": ["/assets/chunk-NISHYRIK-C6H48Nd1.js", "/assets/app.settings-DT-tHRjK.js", "/assets/app.logs-J2Yd_1Sl.js", "/assets/components-UtzYwED0.js", "/assets/use-is-after-initial-mount-BFIEK1BH.js", "/assets/context-BMVwFbqw.js", "/assets/context-DPdHSVAu.js", "/assets/index-Cg0tdoWy.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app.logs": { "id": "routes/app.logs", "parentId": "routes/app", "path": "logs", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/app.logs-BN-zXjYb.js", "imports": ["/assets/app.logs-J2Yd_1Sl.js", "/assets/chunk-NISHYRIK-C6H48Nd1.js", "/assets/components-UtzYwED0.js", "/assets/use-is-after-initial-mount-BFIEK1BH.js", "/assets/context-BMVwFbqw.js", "/assets/index-Cg0tdoWy.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 } }, "url": "/assets/manifest-13bd3380.js", "version": "13bd3380", "sri": void 0 };
const assetsBuildDirectory = "build\\client";
const basename = "/";
const future = { "v8_middleware": false, "unstable_optimizeDeps": false, "unstable_splitRouteModules": false, "unstable_subResourceIntegrity": false, "unstable_viteEnvironmentApi": false };
const ssr = true;
const isSpaMode = false;
const prerender = [];
const routeDiscovery = { "mode": "lazy", "manifestPath": "/__manifest" };
const publicPath = "/";
const entry = { module: entryServer };
const routes = {
  "root": {
    id: "root",
    parentId: void 0,
    path: "",
    index: void 0,
    caseSensitive: void 0,
    module: route0
  },
  "routes/webhooks.app.scopes_update": {
    id: "routes/webhooks.app.scopes_update",
    parentId: "root",
    path: "webhooks/app/scopes_update",
    index: void 0,
    caseSensitive: void 0,
    module: route1
  },
  "routes/webhooks.app.uninstalled": {
    id: "routes/webhooks.app.uninstalled",
    parentId: "root",
    path: "webhooks/app/uninstalled",
    index: void 0,
    caseSensitive: void 0,
    module: route2
  },
  "routes/webhooks.orders-create": {
    id: "routes/webhooks.orders-create",
    parentId: "root",
    path: "webhooks/orders-create",
    index: void 0,
    caseSensitive: void 0,
    module: route3
  },
  "routes/auth.login": {
    id: "routes/auth.login",
    parentId: "root",
    path: "auth/login",
    index: void 0,
    caseSensitive: void 0,
    module: route4
  },
  "routes/auth.$": {
    id: "routes/auth.$",
    parentId: "root",
    path: "auth/*",
    index: void 0,
    caseSensitive: void 0,
    module: route5
  },
  "routes/_index": {
    id: "routes/_index",
    parentId: "root",
    path: void 0,
    index: true,
    caseSensitive: void 0,
    module: route6
  },
  "routes/app": {
    id: "routes/app",
    parentId: "root",
    path: "app",
    index: void 0,
    caseSensitive: void 0,
    module: route7
  },
  "routes/app.additional": {
    id: "routes/app.additional",
    parentId: "routes/app",
    path: "additional",
    index: void 0,
    caseSensitive: void 0,
    module: route8
  },
  "routes/app.settings": {
    id: "routes/app.settings",
    parentId: "routes/app",
    path: "settings",
    index: void 0,
    caseSensitive: void 0,
    module: route9
  },
  "routes/app._index": {
    id: "routes/app._index",
    parentId: "routes/app",
    path: void 0,
    index: true,
    caseSensitive: void 0,
    module: route10
  },
  "routes/app.logs": {
    id: "routes/app.logs",
    parentId: "routes/app",
    path: "logs",
    index: void 0,
    caseSensitive: void 0,
    module: route11
  }
};
export {
  serverManifest as assets,
  assetsBuildDirectory,
  basename,
  entry,
  future,
  isSpaMode,
  prerender,
  publicPath,
  routeDiscovery,
  routes,
  ssr
};
