import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import { shopifyRequest, upsertMetafield } from "./shopifyClient.js";
import { log } from "./logger.js";

dotenv.config();

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

/**
 * Stage → Timestamp metafield mapping
 */
const stagePairs = [
  { field: "sent_to_design_production", timestamp: "sent_to_design_production_timestamp" },
  { field: "pending_customer_approval", timestamp: "pending_customer_approval_timestamp" },
  { field: "production_initiated", timestamp: "production_initiated_timestamp" },
  { field: "in_production", timestamp: "in_production_timestamp" },
  { field: "cleaning_packaging", timestamp: "cleaning_packaging_timestamp" },
  { field: "packed_ready_to_ship", timestamp: "packed_ready_to_ship_timestamp" },
];

/**
 * Helper: formatted timestamp
 */
const formatTimestamp = () => {
  const now = new Date();
  const options = {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  };
  return now.toLocaleString("en-US", options);
};

/**
 * Webhook: Order updated
 */
app.post("/webhook/orders/update", async (req, res) => {
  try {
    const order = req.body;
    const orderId = order.id;
    log(`📦 Webhook triggered for Order ID: ${orderId}`);

    // Fetch all order metafields
    const metafieldsResponse = await shopifyRequest(`orders/${orderId}/metafields.json`);
    const metafields = metafieldsResponse.metafields || [];

    for (const pair of stagePairs) {
      const main = metafields.find((m) => m.key === pair.field);
      const timestamp = metafields.find((m) => m.key === pair.timestamp);

      // 🧱 Create missing main metafield (default "No")
      if (!main) {
        await upsertMetafield("orders", orderId, "custom", pair.field, "No");
        log(`Created missing main metafield: ${pair.field}`, "warn");
      }

      // Re-fetch after creating
      const updated = await shopifyRequest(`orders/${orderId}/metafields.json`);
      const currentMain = updated.metafields.find((m) => m.key === pair.field);
      const currentTs = updated.metafields.find((m) => m.key === pair.timestamp);

      // ⏱️ When value = "Yes", update timestamp
      if (currentMain?.value === "Yes") {
        const formatted = `${pair.field.replace(/_/g, " ")} at ${formatTimestamp()}`;
        await upsertMetafield("orders", orderId, "custom", pair.timestamp, formatted);
        log(`✅ Updated ${pair.timestamp}: ${formatted}`, "success");
      }
    }

    res.status(200).send("✅ Order timestamps updated successfully");
  } catch (error) {
    log(`Webhook error: ${error.message}`, "error");
    res.status(500).send("❌ Internal Server Error");
  }
});

/**
 * Health check
 */
app.get("/", (req, res) => {
  res.send("✅ Shopify Order Timestamp Webhook is running");
});

app.listen(PORT, () => log(`🚀 Server running on port ${PORT}`, "success"));
