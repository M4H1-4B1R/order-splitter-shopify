import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, Form } from "react-router";
import {
  Page,
  Layout,
  Card,
  Button,
  BlockStack,
  FormLayout,
  TextField,
  LegacyStack,
  Text,
  ChoiceList,
  Select,
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import db from "../db.server";
import { authenticate } from "../shopify.server";

// Fetch initial data for the component
export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const { shop } = session;

  const settings = await db.appSettings.upsert({
    where: { shop },
    update: {},
    create: { shop, splittingEnabled: true },
  });

  const mappings = await db.locationMapping.findMany({ where: { shop } });

  const locationsResponse = await admin.graphql(
    `#graphql
      query {
        locations(first: 20) {
          edges {
            node {
              id
              name
            }
          }
        }
      }`
  );
  let locations = [];
  try {
    const locationsData = await locationsResponse.json();
    locations = (locationsData?.data?.locations?.edges || []).map(
      (edge) => edge.node
    );
  } catch (err) {
    // If Shopify graphql query fails for any reason, continue with empty locations
    console.error("Failed to fetch locations from Shopify:", err);
    locations = [];
  }

  return json({
    shop,
    settings: settings || { splittingEnabled: false },
    mappings: mappings || [],
    locations,
  });
};

// Handle form submissions
export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const { shop } = session;
  const formData = await request.formData();
  const action = formData.get("_action");

  if (action === "updateSettings") {
    const splittingEnabled = formData.get("splittingEnabled") === "true";
    await db.appSettings.update({
      where: { shop },
      data: { splittingEnabled },
    });
    return json({ success: true, message: "Settings updated." });
  }

  if (action === "addMapping") {
    const locationCode = formData.get("locationCode");
    const locationGid = formData.get("locationGid");
    if (locationCode && locationGid) {
      await db.locationMapping.create({
        data: { shop, locationCode, locationGid },
      });
    }
    return json({ success: true, message: "Mapping added." });
  }

  if (action === "deleteMapping") {
    const id = parseInt(formData.get("id"), 10);
    await db.locationMapping.delete({ where: { id } });
    return json({ success: true, message: "Mapping deleted." });
  }

  // Toggle pre-sale status for a Shopify Location (writes a metafield on the Location)
  if (action === "togglePresaleLocation") {
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
          type: "single_line_text_field",
        },
      });
    }

    return json({
      success: true,
      message: "Location pre-sale status updated.",
    });
  }

  return json({ success: false, message: "Invalid action." });
};

export default function AppSettings() {
  const submit = useSubmit();
  // Guard against undefined loader data and provide sensible defaults
  const loaderData = useLoaderData() || {};
  const {
    settings = { splittingEnabled: false },
    mappings = [],
    locations = [],
  } = loaderData;

  const [splittingEnabled, setSplittingEnabled] = useState(
    Boolean(settings.splittingEnabled)
  );
  const [newCode, setNewCode] = useState("");
  const [selectedLocation, setSelectedLocation] = useState(
    locations[0]?.id || ""
  );

  const handleSaveSettings = () => {
    const formData = new FormData();
    formData.append("_action", "updateSettings");
    formData.append("splittingEnabled", splittingEnabled ? "true" : "false");
    submit(formData, { method: "post" });
  };

  const handleAddMapping = () => {
    const formData = new FormData();
    formData.append("_action", "addMapping");
    formData.append("locationCode", newCode);
    formData.append("locationGid", selectedLocation);
    submit(formData, { method: "post" });
    setNewCode("");
  };

  const locationOptions = locations.map((loc) => ({
    label: loc.name,
    value: loc.id,
  }));

  return (
    <BlockStack gap="500">
      <Card>
        <BlockStack gap="500">
          <Text as="h2" variant="headingMd">
            General Settings
          </Text>
          <ChoiceList
            title="Order Splitting"
            choices={[{ label: "Enable order splitting logic", value: "true" }]}
            selected={splittingEnabled ? ["true"] : []}
            onChange={(value) => setSplittingEnabled(value.includes("true"))}
          />
          <Button onClick={handleSaveSettings} variant="primary">
            Save Settings
          </Button>
        </BlockStack>
      </Card>

      <Card>
        <BlockStack gap="500">
          <Text as="h2" variant="headingMd">
            Location Mappings
          </Text>
          <Text>
            Map your product/variant `location_code` metafields to Shopify
            inventory locations.
          </Text>
          <FormLayout>
            <FormLayout.Group>
              <TextField
                label="Location Code"
                value={newCode}
                onChange={setNewCode}
                autoComplete="off"
                placeholder="e.g., NY-WAREHOUSE"
              />
              <Select
                label="Shopify Location"
                options={locationOptions}
                onChange={setSelectedLocation}
                value={selectedLocation}
              />
            </FormLayout.Group>
            <Button
              onClick={handleAddMapping}
              disabled={!newCode || !selectedLocation}
            >
              Add Mapping
            </Button>
          </FormLayout>

          <BlockStack gap="200">
            {mappings.map((map) => (
              <LegacyStack
                key={map.id}
                alignment="center"
                distribution="equalSpacing"
              >
                <Text>
                  {map.locationCode} →{" "}
                  {locations.find((l) => l.id === map.locationGid)?.name ||
                    map.locationGid}
                </Text>
                <Form method="post">
                  <input type="hidden" name="_action" value="deleteMapping" />
                  <input type="hidden" name="id" value={map.id} />
                  <Button submit variant="tertiary">
                    Delete
                  </Button>
                </Form>
              </LegacyStack>
            ))}

            <Text as="h3" variant="headingSm">
              Shopify Locations
            </Text>
            {locations.map((loc) => (
              <LegacyStack
                key={loc.id}
                alignment="center"
                distribution="equalSpacing"
              >
                <Text>{loc.name}</Text>
                <Form method="post">
                  <input
                    type="hidden"
                    name="_action"
                    value="togglePresaleLocation"
                  />
                  <input type="hidden" name="locationGid" value={loc.id} />
                  {/* default false; merchants should toggle as needed */}
                  <input type="hidden" name="isPresale" value={"false"} />
                  <Button submit variant="secondary">
                    Mark Pre-Sale
                  </Button>
                </Form>
              </LegacyStack>
            ))}
          </BlockStack>
        </BlockStack>
      </Card>
    </BlockStack>
  );
}
