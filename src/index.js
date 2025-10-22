import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const app = express();
app.use(bodyParser.json());

const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;

// Define metafield pairs: main → timestamp
const metafieldPairs = [
  { main: "sent_to_design_production", timestamp: "sent_to_design_production_timestamp" },
  { main: "pending_customer_approval", timestamp: "pending_customer_approval_timestamp" },
  { main: "production_initiated", timestamp: "production_initiated_timestamp" },
  { main: "in_production", timestamp: "in_production_timestamp" },
  { main: "cleaning_packaging", timestamp: "cleaning_packaging_timestamp" },
  { main: "packed_ready_to_ship", timestamp: "packed_ready_to_ship_timestamp" },
];

// Fetch a specific metafield for an order
async function getMetafield(orderId, namespace, key) {
  const url = `https://${SHOPIFY_STORE}/admin/api/2025-07/orders/${orderId}/metafields.json?namespace=${namespace}&key=${key}`;
  const res = await fetch(url, {
    headers: { "X-Shopify-Access-Token": ACCESS_TOKEN }
  });
  const data = await res.json();
  return data.metafields?.[0]?.value || null;
}

// Update or create a metafield
async function updateMetafield(orderId, namespace, key, value) {
  const url = `https://${SHOPIFY_STORE}/admin/api/2025-07/orders/${orderId}/metafields.json`;

  const body = {
    metafield: {
      namespace,
      key,
      value,
      type: "single_line_text_field",
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": ACCESS_TOKEN,
    },
    body: JSON.stringify(body),
  });

  return response.json();
}

// Webhook endpoint
app.post("/order-updated", async (req, res) => {
  const order = req.body;
  const orderId = order.id;

  try {
    for (const pair of metafieldPairs) {
      const mainValueCurrent = order.metafields?.custom?.[pair.main];
      if (!mainValueCurrent) continue;

      // Fetch the previous value from Shopify
      const mainValuePrevious = await getMetafield(orderId, "custom", pair.main);

      // Only update timestamp if value changed
      if (mainValuePrevious !== mainValueCurrent) {
        const timestamp = new Date().toISOString();
        await updateMetafield(orderId, "custom", pair.timestamp, timestamp);
        console.log(`Updated timestamp for ${pair.main}: ${timestamp}`);
      }
    }

    res.status(200).send({ success: true });
  } catch (error) {
    console.error("Error updating timestamps:", error);
    res.status(500).send({ success: false, error: error.message });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log(`Server running on port ${process.env.PORT || 3000}`);
});
