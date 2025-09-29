
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Page, Card, DataTable, Pagination, BlockStack, Text } from "@shopify/polaris";
import { format } from "date-fns";
import db from "../db.server";
import { authenticate } from "../shopify.server";

const LOGS_PER_PAGE = 10;

// Fetch log data
export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const { shop } = session;
  
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1", 10);
  const skip = (page - 1) * LOGS_PER_PAGE;

  const logs = await db.splitLog.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
    take: LOGS_PER_PAGE,
    skip,
  });

  const logCount = await db.splitLog.count({ where: { shop } });

  return json({ 
    logs, 
    page, 
    logCount, 
    totalPages: Math.ceil(logCount / LOGS_PER_PAGE) 
  });
};

export default function AppLogs() {
  const { logs, page, totalPages } = useLoaderData();

  const rows = logs.map((log) => [
    log.originalOrderId,
    log.splitOrderIds || "N/A",
    log.message,
    format(new Date(log.createdAt), "yyyy-MM-dd hh:mm a"),
  ]);

  return (
    <Card>
      <BlockStack gap="500">
        <Text as="h2" variant="headingMd">Action Logs</Text>
        <DataTable
          columnContentTypes={["text", "text", "text", "text"]}
          headings={["Original Order", "Split Orders", "Action/Message", "Timestamp"]}
          rows={rows}
        />
        {totalPages > 1 && (
          <Pagination
            hasPrevious={page > 1}
            onPrevious={() => {
              // Handle previous page navigation
            }}
            hasNext={page < totalPages}
            onNext={() => {
              // Handle next page navigation
            }}
          />
        )}
      </BlockStack>
    </Card>
  );
}
