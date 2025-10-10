import express from 'express';
import bodyParser from 'body-parser';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { shopifyClient } from './shopifyClient.js';
import { logMessage } from './logger.js';

dotenv.config();

const app = express();
app.use(bodyParser.json({ type: 'application/json' }));

// Stages to timestamp
const stages = [
  { key: 'sent_to_design', name: 'Sent to Design/Production' },
  { key: 'pending_customer_approval', name: 'Pending Customer Approval' },
  { key: 'production_initiated', name: 'Production Initiated' },
  { key: 'production_stage', name: 'Production Stage' },
  { key: 'quality_check_packaging', name: 'Quality Check & Packaging' },
  { key: 'shipped_out', name: 'Shipped Out' },
];

// Verify webhook HMAC
function verifyShopifyWebhook(req, res, next) {
  try {
    const hmac = req.headers['x-shopify-hmac-sha256'];
    const body = JSON.stringify(req.body);
    const digest = crypto
      .createHmac('sha256', process.env.SHOPIFY_WEBHOOK_SECRET || '')
      .update(body, 'utf8')
      .digest('base64');

    if (digest !== hmac) {
      logMessage('⚠️ Shopify webhook verification failed.');
      return res.status(401).send('Unauthorized');
    }
    next();
  } catch (err) {
    logMessage(`❌ Webhook verification error: ${err.message}`);
    res.status(500).send('Webhook verification error');
  }
}

// Create timestamp metafields for missing stages
async function updateStageTimestamps(orderId) {
  try {
    const order = await shopifyClient.get({ path: `orders/${orderId}/metafields` });
    const metafields = order.body.metafields || [];

    for (const stage of stages) {
      const existing = metafields.find(m => m.namespace === 'custom' && m.key === stage.key);
      if (!existing || !existing.value) {
        const timestamp = new Date().toLocaleString();
        await shopifyClient.post({
          path: `orders/${orderId}/metafields`,
          data: {
            metafield: {
              namespace: 'custom',
              key: stage.key,
              value: timestamp,
              type: 'single_line_text_field',
            },
          },
          type: 'application/json',
        });
        logMessage(`✅ Added timestamp for Order #${orderId} → ${stage.name} (${timestamp})`);
      }
    }
  } catch (err) {
    logMessage(`❌ Error updating timestamps for Order #${orderId}: ${err.message}`);
  }
}

// Webhook route
app.post('/webhook/order-updated', verifyShopifyWebhook, async (req, res) => {
  try {
    const orderId = req.body.id;
    if (!orderId) throw new Error('Missing order ID in webhook payload');
    await updateStageTimestamps(orderId);
    res.status(200).send('Webhook processed');
  } catch (err) {
    logMessage(`❌ Error handling webhook: ${err.message}`);
    res.status(500).send('Error processing webhook');
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logMessage(`✅ Shopify Timestamp Webhook running on port ${PORT}`);
});
