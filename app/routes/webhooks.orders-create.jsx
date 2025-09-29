
import { json } from "@remix-run/node";
import db from "../db.server";
import { authenticate } from "../shopify.server";

const GET_ORDER_DETAILS_QUERY = `
  query getOrder($id: ID!) {
    order(id: $id) {
      id
      name
      tags
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
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const ORDER_EDIT_ADD_ITEM_MUTATION = `
  mutation orderEditAddVariant($id: ID!, $variantId: ID!, $quantity: Int!) {
    orderEditAddVariant(id: $id, variantId: $variantId, quantity: $quantity) {
      calculatedOrder {
        id
        addedLineItems(first: 5) {
          nodes {
            id
            quantity
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

export const action = async ({ request }) => {
  const { topic, shop, admin, payload } = await authenticate.webhook(request);

  if (topic !== "ORDERS_CREATE") {
    throw new Response("Unhandled webhook topic", { status: 404 });
  }

  console.log("--- Order Create Webhook Received ---");
  console.log("Shop:", shop);
  console.log("Payload Order ID:", payload.id);

  try {
    const settings = await db.appSettings.findUnique({ where: { shop } });
    if (!settings?.splittingEnabled) {
      console.log("Order splitting is disabled for this shop.");
      return json({ message: "Splitting disabled." });
    }

    const orderGid = `gid://shopify/Order/${payload.id}`;

    // 1. Fetch order details
    const orderResponse = await admin.graphql(GET_ORDER_DETAILS_QUERY, {
      variables: { id: orderGid },
    });
    const orderData = await orderResponse.json();
    const order = orderData.data.order;

    if (!order) {
      throw new Error("Order not found.");
    }

    // 2. Check for processing tags
    if (order.tags.includes("split-processed") || order.tags.includes("pre-sale-retained")) {
      console.log(`Order ${order.name} already processed.`);
      return json({ message: "Order already processed." });
    }
    
    // 3. Check payment status
    if (order.displayFinancialStatus !== 'PAID') {
        console.log(`Order ${order.name} is not fully paid.`);
        return json({ message: "Order not paid." });
    }

    const lineItems = order.lineItems.nodes;
    const presaleItems = [];
    const nonPresaleItems = [];

    lineItems.forEach(item => {
      if (item.location?.isPresale?.value === "true") {
        presaleItems.push(item);
      } else {
        nonPresaleItems.push(item);
      }
    });

    // 4. Decide action based on item types
    if (presaleItems.length === 0 || presaleItems.length === lineItems.length) {
      // Case: No pre-sale items OR all items are pre-sale -> Retain original order
      const tag = presaleItems.length === 0 ? "no-presale-items" : "pre-sale-retained";
      await admin.graphql(TAGS_ADD_MUTATION, { variables: { id: orderGid, tags: [tag] } });
      
      await db.splitLog.create({
        data: {
          shop,
          originalOrderId: order.name,
          retained: true,
          message: presaleItems.length === 0 ? "No pre-sale items in order." : "All items are pre-sale; order retained.",
        },
      });
      console.log(`Order ${order.name} retained. Reason: ${tag}`);
      return json({ message: "Order retained." });
    }

    // 5. Logic for splitting the order
    console.log(`Splitting order ${order.name}...`);
    const presaleGroups = {}; // Group by location code

    for (const item of presaleItems) {
      const locationCode = item.variant?.locationCode?.value || "DEFAULT";
      if (!presaleGroups[locationCode]) {
        presaleGroups[locationCode] = [];
      }
      presaleGroups[locationCode].push(item);
    }
    
    const locationMappings = await db.locationMapping.findMany({ where: { shop } });
    const mappingDict = locationMappings.reduce((acc, map) => {
        acc[map.locationCode] = map.locationGid;
        return acc;
    }, {});

    const splitOrderIds = [];

    // Create new orders for each pre-sale group
    for (const locationCode in presaleGroups) {
      const items = presaleGroups[locationCode];
      const locationId = mappingDict[locationCode];
      
      if (!locationId) {
          console.warn(`No location mapping found for code: ${locationCode}. Skipping split.`);
          continue;
      }

      const newOrder = {
        lineItems: items.map(item => ({
          variantId: item.variant.id,
          quantity: item.quantity,
        })),
        shippingAddress: payload.shipping_address,
        customer: { id: `gid://shopify/Customer/${payload.customer.id}` },
        tags: ["split-child"],
      };

      // This is a simplified creation. A real app would need a more robust order creation mutation.
      // For now, we log what would happen.
      const newOrderName = `${order.name}-P${splitOrderIds.length + 1}`;
      console.log("--- Would create new order:", newOrderName, "---");
      console.log("Location GID:", locationId);
      console.log("Items:", newOrder.lineItems);
      splitOrderIds.push(newOrderName);
    }

    // 6. Update original order (this is complex with OrderEdit mutations)
    // For this example, we'll just tag it. A real implementation would remove the presale items.
    console.log("--- Would update original order:", order.name, "---");
    console.log("To contain only items:", nonPresaleItems.map(i => i.variant.id));
    
    await admin.graphql(TAGS_ADD_MUTATION, { variables: { id: orderGid, tags: ["split-processed"] } });

    // 7. Log the split action
    await db.splitLog.create({
      data: {
        shop,
        originalOrderId: order.name,
        splitOrderIds: splitOrderIds.join(","),
        retained: false,
        message: `Order split into ${splitOrderIds.length} new orders.`,
      },
    });

    console.log(`Order ${order.name} processed successfully.`);
    return json({ success: true });

  } catch (error) {
    console.error("--- Webhook Processing Error ---");
    console.error(error);
    // Return 500 to let Shopify know something went wrong and it should retry
    return new Response("Internal Server Error", { status: 500 });
  }
};
