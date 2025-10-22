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
 * Mapping between stage metafields and their timestamp counterparts
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
 * Shopify webhook endpoint (e.g., order update)
 */
app.post("/webhook/orders/update", async (req, res) => {
  try {
    const order = req.body;
    const orderId = order.id;

    log(`Webhook received for order #${orderId}`);

    const metafieldsResponse = await shopifyRequest(`orders/${orderId}/metafields.json`);
    const metafields = metafieldsResponse.metafields || [];

    for (const pair of stagePairs) {
      const main = metafields.find(m => m.key === pair.field);
      const ts = metafields.find(m => m.key === pair.timestamp);

      if (!main) continue;

      // Create or update timestamp when field is "Yes"
      if (main.value === "Yes") {
        const now = new Date();
        const formatted = now.toISOString();

        // ✅ If timestamp missing OR value changed → update timestamp
        if (!ts || ts.value !== formatted) {
          await upsertMetafield("orders", orderId, "custom", pair.timestamp, formatted);
        }
      }
    }

    res.status(200).send("Timestamps updated successfully");
  } catch (error) {
    log(`Error processing webhook: ${error.message}`, "error");
    res.status(500).send("Internal Server Error");
  }
});

/**
 * Health check
 */
app.get("/", (req, res) => {
  res.send("✅ Shopify Metafield Timestamp Updater is running");
});

app.listen(PORT, () => log(`Server listening on port ${PORT}`, "success"));
