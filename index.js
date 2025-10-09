import express from "express";
import crypto from "crypto";
import bodyParser from "body-parser";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const app = express();

// Verify Shopify webhook signature
const verifyShopifyWebhook = (req, res, buf) => {
  const hmacHeader = req.get("X-Shopify-Hmac-Sha256");
  const digest = crypto
    .createHmac("sha256", process.env.SHOPIFY_WEBHOOK_SECRET)
    .update(buf)
    .digest("base64");

  if (digest !== hmacHeader) {
    throw new Error("Webhook verification failed");
  }
};

// Apply middleware for webhook endpoint only
app.use(
  "/webhook/order-updated",
  bodyParser.json({ verify: verifyShopifyWebhook })
);

app.post("/webhook/order-updated", async (req, res) => {
  try {
    const order = req.body;

    console.log(`📦 Received webhook for order #${order.id}`);

    // Get metafields if present
    const metafields = order.metafields || [];

    const designField = metafields.find(
      (m) => m.namespace === "custom" && m.key === "sent_to_design_production"
    );

    if (!designField) {
      console.log("⚠️ No relevant metafield found.");
      return res.status(200).send("No relevant metafield found");
    }

    // If 'sent_to_design_production' is true, update timestamp metafield
    if (designField.value === "true" || designField.value === true) {
      const now = new Date().toISOString();

      await axios.post(
        `https://${process.env.SHOPIFY_STORE.replace(
          "https://",
          ""
        )}/admin/api/2024-10/metafields.json`,
        {
          metafield: {
            namespace: "custom",
            key: "sent_to_design_production_timestamp",
            type: "single_line_text_field",
            value: now,
            owner_resource: "order",
            owner_id: order.id,
          },
        },
        {
          headers: {
            "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN,
            "Content-Type": "application/json",
          },
        }
      );

      console.log(`✅ Timestamp updated for order ${order.id}: ${now}`);
    } else {
      console.log("ℹ️ 'sent_to_design_production' not set to true. Skipping update.");
    }

    res.status(200).send("OK");
  } catch (error) {
    console.error("❌ Webhook processing error:", error.message);
    res.status(500).send("Webhook error");
  }
});

// Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
