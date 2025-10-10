import { Shopify } from '@shopify/shopify-api';
import dotenv from 'dotenv';
dotenv.config();

const SHOPIFY_STORE_URL = process.env.SHOPIFY_STORE_URL;
const SHOPIFY_ADMIN_API_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN;

if (!SHOPIFY_STORE_URL) throw new Error('Missing SHOPIFY_STORE_URL environment variable!');
if (!SHOPIFY_ADMIN_API_ACCESS_TOKEN) throw new Error('Missing SHOPIFY_ADMIN_API_ACCESS_TOKEN environment variable!');

const storeDomain = SHOPIFY_STORE_URL.replace(/^https?:\/\//, '');

export const shopifyClient = new Shopify.Clients.Rest(storeDomain, SHOPIFY_ADMIN_API_ACCESS_TOKEN);
console.log(`✅ Shopify client initialized for store: ${storeDomain}`);
