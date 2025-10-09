import express from "express";
import axios from "axios";
import bodyParser from "body-parser";
import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

app.use(bodyParser.json());

// ✅ Verify Shopify webhook authenticity
function verifyShopifyWebhook(req) {
  const hmac = req.get("X-Shopify-Hmac-Sha256");
  const body = JSON.stringify(req.body);
  const digest = crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(body, "utf8")
    .digest("base64");
  return hmac === digest;
}

// ✅ Format timestamp
function formatTimestamp() {
  const now = new Date();
  return now.toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "numeric",
    hour12: true,
  });
}

// ✅ Update existing metafield (find + update)
async function updateOrderMetafield(orderId, key, value) {
  try {
    // Step 1: Get all metafields for this order
    const { data } = await axios.get(
      `https://${SHOPIFY_STORE_URL}/admin/api/2025-01/orders/${orderId}/metafields.json`,
      {
        headers: {
          "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
        },
      }
    );

    const existing = data.metafields.find(
      (m) => m.namespace === "custom" && m.key === key
    );

    if (existing) {
      // Step 2: Update existing metafield
      await axios.put(
        `https://${SHOPIFY_STORE_URL}/admin/api/2025-01/metafields/${existing.id}.json`,
        {
          metafield: {
            id: existing.id,
            value,
          },
        },
        {
          headers: {
            "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
            "Content-Type": "application/json",
          },
        }
      );
      console.log(`✅ Updated existing metafield: ${key}`);
    } else {
      // Step 3: Create if missing
      await axios.post(
        `https://${SHOPIFY_STORE_URL}/admin/api/2025-01/orders/${orderId}/metafields.json`,
        {
          metafield: {
            namespace: "custom",
            key,
            type: "single_line_text_field",
            value,
          },
        },
        {
          headers: {
            "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
            "Content-Type": "application/json",
          },
        }
      );
      console.log(`🆕 Created new metafield: ${key}`);
    }
  } catch (error) {
    console.error(`❌ Error updating ${key}:`, error.response?.data || error.message);
  }
}

// ✅ Webhook route
app.post("/webhook", async (req, res) => {
  if (!verifyShopifyWebhook(req)) {
    return res.status(401).send("Unauthorized");
  }

  const order = req.body;
  const orderId = order.id;
  const tags = order.tags ? order.tags.split(",").map((t) => t.trim().toLowerCase()) : [];

  console.log(`📦 Order ${orderId} updated | Tags:`, tags);

  // ✅ Mapping between tags & your metafields
  const metafieldMap = {
    "sent to design": "sent_to_design_production_timestamp",
    "pending customer approval": "pending_customer_approval_timestamp",
    "production initiated": "production_initiated_timestamp",
    "production stage": "production_stage_timestamp",
    "quality check & packaging": "quality_check_packaging_timestamp",
    "shipped out": "shipped_out_timestamp",
  };

  for (const [tag, key] of Object.entries(metafieldMap)) {
    if (tags.includes(tag)) {
      const timestampValue = `${tag
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .replace(/_/g, " ")} at ${formatTimestamp()}`;
      await updateOrderMetafield(orderId, key, timestampValue);
    }
  }

  res.status(200).send("Webhook processed successfully");
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
