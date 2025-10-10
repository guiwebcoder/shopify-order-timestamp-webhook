import fetch from 'node-fetch';
import dotenv from 'dotenv';
dotenv.config();

const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL;
const SHOPIFY_ADMIN_API_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;

if (!SHOPIFY_STORE_URL) throw new Error('❌ Missing SHOPIFY_STORE_URL in .env');
if (!SHOPIFY_ADMIN_API_ACCESS_TOKEN) throw new Error('❌ Missing SHOPIFY_ADMIN_API_ACCESS_TOKEN in .env');

export async function shopifyRequest(endpoint, method = 'GET', body = null) {
  const url = `https://${SHOPIFY_STORE_URL}/admin/api/2024-07/${endpoint}`;
  const headers = {
    'X-Shopify-Access-Token': SHOPIFY_ADMIN_API_ACCESS_TOKEN,
    'Content-Type': 'application/json',
  };

  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);

  const response = await fetch(url, options);

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`❌ Shopify API Error: ${response.status} ${response.statusText}\n${errorText}`);
    throw new Error(`Shopify API request failed: ${response.status}`);
  }

  return response.json();
}
