import db from "../db.server";
import { authenticate } from "../shopify.server";

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

// Helper to call admin.graphql with retries and exponential backoff to handle transient API errors / rate limits
async function graphqlWithRetry(admin, query, opts = {}, maxRetries = 3) {
  let attempt = 0;
  while (true) {
    try {
      const resp = await admin.graphql(query, opts);
      // Try to read status if provided
      const status = resp?.status;
      const data = await resp.json();

      // HTTP-level retryable statuses
      if (status === 429 || (status && status >= 500)) {
        throw new Error(`HTTP ${status}`);
      }

      // GraphQL-level errors indicating throttling
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
        console.error(
          `graphqlWithRetry failed after ${attempt} attempts:`,
          err.message
        );
        throw err;
      }
      const delay =
        Math.pow(2, attempt) * 1000 + Math.floor(Math.random() * 1000);
      console.warn(
        `GraphQL attempt ${attempt} failed, retrying after ${delay}ms:`,
        err.message
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

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
      return new Response(JSON.stringify({ message: "Splitting disabled." }));
    }

    const orderGid = `gid://shopify/Order/${payload.id}`;

    // 1. Fetch order details
    const orderRespData = await graphqlWithRetry(
      admin,
      GET_ORDER_DETAILS_QUERY,
      {
        variables: { id: orderGid },
      }
    );
    const order = orderRespData?.data?.order;

    if (!order) {
      throw new Error("Order not found.");
    }

    // 2. Check for processing tags
    const existingTags = order.tags || [];
    const metafields = (order.metafields?.edges || []).map((e) => e.node) || [];

    // Duplicate prevention: check for existing split_id metafield or tags
    const hasSplitId = metafields.find(
      (mf) => mf.namespace === "custom" && mf.key === "split_id"
    );
    if (
      existingTags.includes("split-processed") ||
      existingTags.includes("pre-sale-retained") ||
      hasSplitId
    ) {
      console.log(`Order ${order.name} already processed or has split_id.`);
      return new Response(
        JSON.stringify({ message: "Order already processed." })
      );
    }

    // 3. Check payment status
    if (order.displayFinancialStatus !== "PAID") {
      console.log(`Order ${order.name} is not fully paid.`);
      return new Response(JSON.stringify({ message: "Order not paid." }));
    }
    // Tag the order and record the event so merchants can identify unpaid orders
    try {
      await graphqlWithRetry(admin, TAGS_ADD_MUTATION, {
        variables: { id: orderGid, tags: ["order-not-paid"] },
      });
    } catch (tagErr) {
      console.warn("Failed to tag unpaid order:", tagErr.message);
    }

    await db.splitLog.create({
      data: {
        shop,
        originalOrderId: order.name,
        retained: true,
        message: "Order not paid.",
      },
    });

    return new Response(JSON.stringify({ message: "Order not paid." }));

    const lineItems = order.lineItems.nodes;
    const presaleItems = [];
    const nonPresaleItems = [];

    lineItems.forEach((item) => {
      if (item.location?.isPresale?.value === "true") {
        presaleItems.push(item);
      } else {
        nonPresaleItems.push(item);
      }
    });

    // 4. Decide action based on item types
    if (presaleItems.length === 0 || presaleItems.length === lineItems.length) {
      // Case: No pre-sale items OR all items are pre-sale -> Retain original order
      const tag =
        presaleItems.length === 0 ? "no-presale-items" : "pre-sale-retained";
      await admin.graphql(TAGS_ADD_MUTATION, {
        variables: { id: orderGid, tags: [tag] },
      });

      // Add a split_id metafield so retries won't re-process
      const splitId = `split_${Date.now()}`;
      await admin.graphql(METAFIELD_UPSERT_MUTATION, {
        variables: {
          ownerId: orderGid,
          namespace: "custom",
          key: "split_id",
          value: splitId,
          type: "single_line_text_field",
        },
      });

      await db.splitLog.create({
        data: {
          shop,
          originalOrderId: order.name,
          retained: true,
          message:
            presaleItems.length === 0
              ? "No pre-sale items in order."
              : "All items are pre-sale; order retained.",
        },
      });
      console.log(`Order ${order.name} retained. Reason: ${tag}`);
      return new Response(JSON.stringify({ message: "Order retained." }));
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

    const locationMappings = await db.locationMapping.findMany({
      where: { shop },
    });
    const missingMappings = [];
    const mappingDict = locationMappings.reduce((acc, map) => {
      acc[map.locationCode] = map.locationGid;
      return acc;
    }, {});

    const splitOrderIds = [];
    const splitCreationErrors = [];

    // Create new orders for each pre-sale group
    try {
      for (const locationCode in presaleGroups) {
        const items = presaleGroups[locationCode];
        const locationId = mappingDict[locationCode];

        if (!locationId) {
          console.warn(
            `No location mapping found for code: ${locationCode}. Skipping split.`
          );
          missingMappings.push(locationCode);
          continue;
        }

        const draftInput = {
          lineItems: items.map((item) => ({
            variantId: item.variant.id,
            quantity: item.quantity,
          })),
          shippingAddress: payload.shipping_address,
          customer: { id: `gid://shopify/Customer/${payload.customer.id}` },
          tags: ["split-child"],
          // You may want to set a note or metafields on the draft to record origin
          note: `Split from ${order.name} for location ${locationCode}`,
        };

        try {
          // 1) Create a draft order
          const createData = await graphqlWithRetry(
            admin,
            CREATE_ORDER_MUTATION,
            {
              variables: { input: draftInput },
            }
          );

          const createErrors =
            createData?.data?.draftOrderCreate?.userErrors || [];
          if (createErrors.length) {
            console.error("Draft order create errors:", createErrors);
            continue; // skip this group on error
          }

          const draftOrder = createData?.data?.draftOrderCreate?.draftOrder;
          if (!draftOrder?.id) {
            console.error("Draft order not returned, skipping", createData);
            continue;
          }

          // 2) Complete the draft to generate a real Order
          const completeData = await graphqlWithRetry(
            admin,
            DRAFT_ORDER_COMPLETE_MUTATION,
            {
              variables: { id: draftOrder.id },
            }
          );

          const completeErrors =
            completeData?.data?.draftOrderComplete?.userErrors || [];
          if (completeErrors.length) {
            console.error("Draft order complete errors:", completeErrors);
            // fallback to use draftOrder info if completion failed
          }

          const createdOrder =
            completeData?.data?.draftOrderComplete?.draftOrder?.order ||
            draftOrder?.order;

          const createdOrderId = createdOrder?.id || draftOrder.id;
          const createdOrderName =
            createdOrder?.name ||
            draftOrder?.order?.name ||
            `${order.name}-P${splitOrderIds.length + 1}`;

          console.log(
            "--- Created order:",
            createdOrderName,
            createdOrderId,
            "---"
          );

          // push the Shopify Order id (GID) for reliable tracking
          splitOrderIds.push(createdOrderId);
          console.log("Recorded split order id:", createdOrderId);

          // Optional: upsert a metafield on the created order linking back to the original
          // If you need to set metafields on the created order, you'd call METAFIELD_UPSERT_MUTATION here
          // with ownerId set to createdOrderId and namespace/key as required.
        } catch (err) {
          console.error(
            "Error creating/completing split order for",
            locationCode,
            err
          );
          continue;
        }
      }
    } catch (err) {
      console.error("Unexpected error during split order creation:", err);
      splitCreationErrors.push(String(err));
    }

    // Log the created split order ids for debugging and auditing
    console.log("Split orders created:", splitOrderIds);
    if (splitCreationErrors.length) {
      console.warn("Split creation had errors:", splitCreationErrors);
    }

    // 6. Update original order (begin an Order Edit, remove pre-sale items, commit)
    // Begin order edit
    try {
      const orderEditBeginResponse = await admin.graphql(ORDER_EDIT_MUTATION, {
        variables: { id: orderGid },
      });
      const editBeginData = await orderEditBeginResponse.json();

      const editBeginErrors =
        editBeginData?.data?.orderEditBegin?.userErrors || [];
      if (editBeginErrors.length) {
        throw new Error(
          "Failed to begin order edit: " + JSON.stringify(editBeginErrors)
        );
      }

      const calculatedOrderId =
        editBeginData?.data?.orderEditBegin?.calculatedOrder?.id;
      if (!calculatedOrderId) {
        throw new Error("No calculatedOrder id returned from orderEditBegin");
      }

      // Adjust quantities or remove pre-sale items using calculatedLineItems mapping
      const calculatedLines =
        editBeginData?.data?.orderEditBegin?.calculatedOrder
          ?.calculatedLineItems?.nodes || [];

      // Helper: find the calculated line that maps to an original lineItem id
      const findCalculatedForOriginal = (originalLineItemId) => {
        return calculatedLines.find(
          (cl) => cl.lineItem?.id === originalLineItemId
        );
      };

      for (const presaleItem of presaleItems) {
        // original order line id
        const originalLineId = presaleItem.id;
        const calculated = findCalculatedForOriginal(originalLineId);

        if (!calculated) {
          console.warn(
            `Could not find calculated line for original line ${originalLineId}. Skipping adjustment.`
          );
          continue;
        }

        // If the original line quantity equals presale quantity, remove the line entirely
        // Otherwise reduce the quantity by presale amount
        const originalQty = presaleItem.quantity;
        const calcQty = calculated.quantity;

        try {
          if (calcQty <= originalQty) {
            // remove the calculated line
            const removeData = await graphqlWithRetry(
              admin,
              ORDER_EDIT_REMOVE_LINEITEM_MUTATION,
              {
                variables: { id: calculatedOrderId, lineItemId: calculated.id },
              }
            );
            const removeErrors =
              removeData?.data?.orderEditRemoveLineItem?.userErrors || [];
            if (removeErrors.length) {
              console.error("Failed to remove calculated line:", removeErrors);
            }
          } else {
            // set new quantity to (calcQty - original presale qty)
            const newQty = calcQty - originalQty;
            const setData = await graphqlWithRetry(
              admin,
              ORDER_EDIT_SET_QUANTITY_MUTATION,
              {
                variables: {
                  id: calculatedOrderId,
                  lineItemId: calculated.id,
                  quantity: newQty,
                },
              }
            );
            const setErrors =
              setData?.data?.orderEditSetQuantity?.userErrors || [];
            if (setErrors.length) {
              console.error(
                "Failed to set quantity on calculated line:",
                setErrors
              );
            }
          }
        } catch (err) {
          console.error(
            "Error adjusting calculated line for",
            originalLineId,
            err
          );
          continue;
        }
      }

      // Commit the edit
      const commitData = await graphqlWithRetry(
        admin,
        ORDER_EDIT_COMMIT_MUTATION,
        {
          variables: {
            id: calculatedOrderId,
            notifyCustomer: false,
            staffNote: "Order split: pre-sale items removed",
          },
        }
      );

      const commitErrors = commitData?.data?.orderEditCommit?.userErrors || [];
      if (commitErrors.length) {
        throw new Error(
          "Failed to commit order edit: " + JSON.stringify(commitErrors)
        );
      }
    } catch (err) {
      console.error("Order edit failed for original order:", err);
      // Depending on your needs you may want to continue or abort. We'll continue and still tag the order.
    }

    // Tag original order as processed
    try {
      await graphqlWithRetry(admin, TAGS_ADD_MUTATION, {
        variables: { id: orderGid, tags: ["split-processed"] },
      });
    } catch (tagErr) {
      console.warn(
        "Failed to tag original order as split-processed:",
        tagErr.message
      );
    }

    // Add a persistent split_id metafield for tracking and duplicate prevention
    const splitId = `split_${Date.now()}`;
    try {
      await graphqlWithRetry(admin, METAFIELD_UPSERT_MUTATION, {
        variables: {
          ownerId: orderGid,
          namespace: "custom",
          key: "split_id",
          value: splitId,
          type: "single_line_text_field",
        },
      });
    } catch (mfErr) {
      console.warn("Failed to upsert split_id metafield:", mfErr.message);
    }

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
    return new Response(JSON.stringify({ success: true }));
  } catch (error) {
    console.error("--- Webhook Processing Error ---");
    console.error(error);
    // Return 500 to let Shopify know something went wrong and it should retry
    return new Response("Internal Server Error", { status: 500 });
  }
};
