import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import { shopifyRequest } from "./shopifyClient.js";
import { log } from "./logger.js";

dotenv.config();

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

// Define the mapping of main metafield → timestamp metafield
const stagePairs = [
  { field: "sent_to_design_production", timestamp: "sent_to_design_production_timestamp" },
  { field: "pending_customer_approval", timestamp: "pending_customer_approval_timestamp" },
  { field: "production_initiated", timestamp: "production_initiated_timestamp" },
  { field: "in_production", timestamp: "production_stage_timestamp" },
  { field: "cleaning_packaging", timestamp: "quality_check_packaging_timestamp" },
  { field: "packed_ready_to_ship", timestamp: "shipped_out_timestamp" },
];

// Function to create a human-readable timestamp
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

app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;
    const orderId = body.id;

    log(`📦 Webhook triggered for Order ID: ${orderId}`);

    // Fetch all metafields for this order
    const response = await shopifyRequest(`orders/${orderId}/metafields.json`, "GET");
    const metafields = response.metafields || [];

    for (const pair of stagePairs) {
      const main = metafields.find((m) => m.key === pair.field && m.namespace === "custom");
      const timestamp = metafields.find((m) => m.key === pair.timestamp && m.namespace === "custom");

      if (main && main.value && main.updated_at) {
        const formatted = `${pair.field.replace(/_/g, " ")} at ${formatTimestamp()}`;

        // Update or create timestamp metafield
        await shopifyRequest(`orders/${orderId}/metafields.json`, "POST", {
          metafield: {
            namespace: "custom",
            key: pair.timestamp,
            type: "single_line_text_field",
            value: formatted,
          },
        });

        log(`✅ Updated ${pair.timestamp}: ${formatted}`);
      }
    }

    res.status(200).send("✅ Order timestamps updated successfully");
  } catch (error) {
    console.error("❌ Error updating timestamps:", error.message);
    res.status(500).send("Error updating order timestamps");
  }
});

app.get("/", (req, res) => {
  res.send("✅ Shopify Order Timestamp Webhook is running");
});

app.listen(PORT, () => log(`🚀 Server running on port ${PORT}`));