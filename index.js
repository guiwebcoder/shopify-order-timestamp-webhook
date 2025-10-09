import express from "express";
import axios from "axios";
import bodyParser from "body-parser";
import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const SHOPIFY_ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;
const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL.replace("https://", "");
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

app.use(bodyParser.json());

// ✅ Verify webhook authenticity
function verifyShopifyWebhook(req) {
  const hmac = req.get("X-Shopify-Hmac-Sha256");
  const body = JSON.stringify(req.body);
  const digest = crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(body, "utf8")
    .digest("base64");
  return hmac === digest;
}

// ✅ Format readable timestamp
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

// ✅ Base headers for API calls
function shopifyHeaders() {
  return {
    "X-Shopify-Access-Token": SHOPIFY_ACCESS_TOKEN,
    "Content-Type": "application/json",
  };
}

// ✅ Automatically create metafield definition (if not exists)
async function ensureMetafieldDefinition(key, name, description) {
  try {
    const definitions = await axios.get(
      `https://${SHOPIFY_STORE_URL}/admin/api/2025-01/metafield_definitions.json?namespace=custom&owner_type=Order`,
      { headers: shopifyHeaders() }
    );

    const exists = definitions.data.metafield_definitions.find(
      (def) => def.key === key
    );

    if (exists) {
      console.log(`🔹 Metafield definition already exists: ${key}`);
      return;
    }

    await axios.post(
      `https://${SHOPIFY_STORE_URL}/admin/api/2025-01/metafield_definitions.json`,
      {
        metafield_definition: {
          name,
          namespace: "custom",
          key,
          type: "single_line_text_field",
          owner_type: "Order",
          description,
          visible_to_storefront_api: true,
          visible_to_unauthenticated_storefront_api: true,
        },
      },
      { headers: shopifyHeaders() }
    );

    console.log(`🆕 Created metafield definition: ${key}`);
  } catch (err) {
    console.error(`❌ Error ensuring metafield definition ${key}:`, err.response?.data || err.message);
  }
}

// ✅ Get metafields for an order
async function getOrderMetafields(orderId) {
  const { data } = await axios.get(
    `https://${SHOPIFY_STORE_URL}/admin/api/2025-01/orders/${orderId}/metafields.json`,
    { headers: shopifyHeaders() }
  );
  return data.metafields;
}

// ✅ Create or update metafield only if empty
async function ensureMetafield(orderId, key, value) {
  try {
    const metafields = await getOrderMetafields(orderId);
    const existing = metafields.find(
      (m) => m.namespace === "custom" && m.key === key
    );

    if (existing && existing.value && existing.value.trim() !== "") {
      console.log(`⏩ Skipped (already has value): ${key}`);
      return;
    }

    const payload = {
      metafield: {
        namespace: "custom",
        key,
        type: "single_line_text_field",
        value,
      },
    };

    if (existing) {
      await axios.put(
        `https://${SHOPIFY_STORE_URL}/admin/api/2025-01/metafields/${existing.id}.json`,
        payload,
        { headers: shopifyHeaders() }
      );
      console.log(`✅ Updated metafield: ${key}`);
    } else {
      await axios.post(
        `https://${SHOPIFY_STORE_URL}/admin/api/2025-01/orders/${orderId}/metafields.json`,
        payload,
        { headers: shopifyHeaders() }
      );
      console.log(`🆕 Created metafield: ${key}`);
    }
  } catch (err) {
    console.error(`❌ Error ensuring metafield ${key}:`, err.response?.data || err.message);
  }
}

// ✅ Main webhook endpoint
app.post("/webhook", async (req, res) => {
  if (!verifyShopifyWebhook(req)) {
    return res.status(401).send("Unauthorized");
  }

  const order = req.body;
  const orderId = order.id;
  const tags = order.tags
    ? order.tags.split(",").map((t) => t.trim().toLowerCase())
    : [];

  // 🧍 Staff name detection
  const staffName =
    order.updated_by?.name ||
    order.user?.name ||
    order.admin_graphql_api_id?.split("/").pop() ||
    "Unknown Staff";

  console.log(`📦 Order ${orderId} updated by ${staffName} | Tags:`, tags);

  // ✅ Mapping between tags & metafields
  const metafieldMap = {
    "sent to design": "sent_to_design_production_timestamp",
    "pending customer approval": "pending_customer_approval_timestamp",
    "production initiated": "production_initiated_timestamp",
    "production stage": "production_stage_timestamp",
    "quality check & packaging": "quality_check_packaging_timestamp",
    "shipped out": "shipped_out_timestamp",
  };

  // ✅ Ensure metafield definitions exist before updating any
  for (const [tag, timestampKey] of Object.entries(metafieldMap)) {
    const readableStage = tag.replace(/\b\w/g, (c) => c.toUpperCase());
    const staffKey = timestampKey.replace("_timestamp", "_by");

    await ensureMetafieldDefinition(
      timestampKey,
      `${readableStage} Timestamp`,
      `Recorded time when ${readableStage} stage triggered.`
    );
    await ensureMetafieldDefinition(
      staffKey,
      `${readableStage} By`,
      `Staff member who triggered ${readableStage} stage.`
    );
  }

  // ✅ Update timestamp and staff when tag found
  for (const [tag, timestampKey] of Object.entries(metafieldMap)) {
    if (tags.includes(tag)) {
      const readableStage = tag.replace(/\b\w/g, (c) => c.toUpperCase());
      const timestampValue = `${readableStage} at ${formatTimestamp()}`;
      const staffKey = timestampKey.replace("_timestamp", "_by");

      await ensureMetafield(orderId, timestampKey, timestampValue);
      await ensureMetafield(orderId, staffKey, staffName);
    }
  }

  res.status(200).send("Webhook processed successfully");
});

app.listen(PORT, () =>
  console.log(`🚀 Full Shopify Timestamp Webhook running on port ${PORT}`)
);
