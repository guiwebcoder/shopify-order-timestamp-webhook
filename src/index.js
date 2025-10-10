import express from 'express';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import { shopifyRequest } from './shopifyClient.js';
import { log } from './logger.js';

dotenv.config();

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

// Define all your stages here
const stages = [
  { key: 'sent_to_design', name: 'Sent to Design/Production' },
  { key: 'pending_customer_approval', name: 'Pending Customer Approval' },
  { key: 'production_initiated', name: 'Production Initiated' },
  { key: 'production_stage', name: 'Production Stage' },
  { key: 'quality_check_packaging', name: 'Quality Check & Packaging' },
  { key: 'shipped_out', name: 'Shipped Out' },
];

// Webhook endpoint
app.post('/webhook', async (req, res) => {
  try {
    const order = req.body;
    const orderId = order.id;
    log(`📦 Received webhook for Order ID: ${orderId}`);

    // Loop through all stages and create metafield if not exists
    for (const stage of stages) {
      const existing = await shopifyRequest(`orders/${orderId}/metafields.json`, 'GET');
      const metafields = existing.metafields || [];
      const alreadyExists = metafields.find(m => m.key === stage.key);

      if (!alreadyExists) {
        const timestamp = new Date().toISOString();
        await shopifyRequest(`orders/${orderId}/metafields.json`, 'POST', {
          metafield: {
            namespace: 'custom',
            key: stage.key,
            type: 'single_line_text_field',
            value: timestamp,
          },
        });
        log(`✅ Created timestamp for ${stage.name}: ${timestamp}`);
      }
    }

    res.status(200).send('✅ Webhook processed');
  } catch (error) {
    console.error('❌ Error processing webhook:', error.message);
    res.status(500).send('Internal server error');
  }
});

// Health check
app.get('/', (req, res) => res.send('✅ Shopify Timestamp Webhook is running'));

app.listen(PORT, () => log(`🚀 Server running on port ${PORT}`));
