import fetch from "node-fetch";
import dotenv from "dotenv";
import { log } from "./logger.js";

dotenv.config();

const SHOPIFY_STORE = process.env.SHOPIFY_STORE;
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN;

/**
 * Generic Shopify API request wrapper
 */
export async function shopifyRequest(endpoint, method = "GET", body = null) {
  const url = `https://${SHOPIFY_STORE}/admin/api/2025-07/${endpoint}`;
  const options = {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": ACCESS_TOKEN,
    },
  };
  if (body) options.body = JSON.stringify(body);

  const response = await fetch(url, options);
  const data = await response.json();

  log(`[${method}] ${url} → ${response.status}`, "info");

  if (!response.ok) {
    log(`Shopify API Error: ${JSON.stringify(data)}`, "error");
    throw new Error(data.errors || "Shopify API request failed");
  }

  return data;
}

/**
 * Creates or updates a metafield automatically.
 */
export async function upsertMetafield(ownerType, ownerId, namespace, key, value, type = "single_line_text_field") {
  try {
    const existing = await shopifyRequest(
      `${ownerType}/${ownerId}/metafields.json?namespace=${namespace}&key=${key}`,
      "GET"
    );

    const metafield = existing.metafields?.[0];

    if (metafield) {
      await shopifyRequest(`metafields/${metafield.id}.json`, "PUT", {
        metafield: { value },
      });
      log(`Updated existing metafield: ${namespace}.${key}`, "success");
    } else {
      await shopifyRequest(`${ownerType}/${ownerId}/metafields.json`, "POST", {
        metafield: { namespace, key, type, value },
      });
      log(`Created new metafield: ${namespace}.${key}`, "success");
    }
  } catch (error) {
    log(`Failed to upsert metafield ${namespace}.${key}: ${error.message}`, "error");
  }
}
