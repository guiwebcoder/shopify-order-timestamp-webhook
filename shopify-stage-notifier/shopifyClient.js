import { Shopify } from '@shopify/shopify-api';

export const shopifyClient = new Shopify.Clients.Rest(
  process.env.SHOPIFY_STORE_URL,
  process.env.SHOPIFY_ADMIN_API_ACCESS_TOKEN
);
