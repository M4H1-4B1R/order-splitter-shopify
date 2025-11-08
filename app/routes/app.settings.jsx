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
      }`,
  );
  let locations = [];
  let locationError = null;

  try {
    console.log("=== LOCATION DEBUG START ===");
    console.log("GraphQL Response Status:", locationsResponse.status);
    console.log("GraphQL Response OK:", locationsResponse.ok);

    if (!locationsResponse.ok) {
      throw new Error(
        `GraphQL request failed with status: ${locationsResponse.status}`,
      );
    }

    const locationsData = await locationsResponse.json();
    console.log("Raw locations data:", JSON.stringify(locationsData, null, 2));

    // Check for GraphQL errors
    if (locationsData.errors) {
      console.error("GraphQL errors:", locationsData.errors);
      locationError = `GraphQL errors: ${JSON.stringify(locationsData.errors)}`;
      throw new Error(locationError);
    }

    locations = (locationsData?.data?.locations?.edges || []).map(
      (edge) => edge.node,
    );
    console.log("Processed locations:", locations);
    console.log("Number of locations found:", locations.length);
    console.log("=== LOCATION DEBUG END ===");
  } catch (err) {
    console.error("Failed to fetch locations from Shopify:", err);
    console.error("Error details:", err.message);
    locationError = err.message;
    locations = [];
  }

  return json({
    shop,
    settings: settings || { splittingEnabled: false },
    mappings: mappings || [],
    locations,
    locationError, // Include error info for debugging
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
    locationError = null,
  } = loaderData;

  const [splittingEnabled, setSplittingEnabled] = useState(
    Boolean(settings.splittingEnabled),
  );
  const [newCode, setNewCode] = useState("");
  const [selectedLocation, setSelectedLocation] = useState(
    locations.length > 0 ? locations[0].id : "",
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

          {/* Debug Information */}
          {locationError && (
            <Text variant="bodySm" color="critical">
              Location Error: {locationError}
            </Text>
          )}

          <Card background="bg-surface-info">
            <BlockStack gap="200">
              <Text variant="headingSm" color="text-info">
                Debug Information
              </Text>
              <Text variant="bodySm">
                <strong>Locations found:</strong> {locations.length}
              </Text>
              {locations.length > 0 ? (
                <BlockStack gap="100">
                  <Text variant="bodySm">
                    <strong>Available locations:</strong>
                  </Text>
                  {locations.map((loc) => (
                    <Text key={loc.id} variant="bodySm">
                      • {loc.name} (ID: {loc.id})
                    </Text>
                  ))}
                </BlockStack>
              ) : (
                <Text variant="bodySm" color="critical">
                  No locations found - this could indicate:
                  <br />• Missing read_locations scope
                  <br />• No locations configured in Shopify
                  <br />• Authentication issues
                </Text>
              )}
              {locationError && (
                <Text variant="bodySm" color="critical">
                  <strong>Error details:</strong> {locationError}
                </Text>
              )}
            </BlockStack>
          </Card>

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
                placeholder={
                  locations.length === 0
                    ? "No locations found"
                    : "Select a location"
                }
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
