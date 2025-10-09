import express from 'express';
import bodyParser from 'body-parser';
import crypto from 'crypto';
import { shopifyClient } from './shopifyClient.js';
import sgMail from '@sendgrid/mail';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
dotenv.config();

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const app = express();
app.use(bodyParser.json({ type: 'application/json' }));

const stages = [
  { key: 'sent_to_design', name: 'Sent to Design/Production' },
  { key: 'pending_customer_approval', name: 'Pending Customer Approval' },
  { key: 'production_initiated', name: 'Production Initiated' },
  { key: 'production_stage', name: 'Production Stage' },
  { key: 'quality_check_packaging', name: 'Quality Check & Packaging' },
  { key: 'shipped_out', name: 'Shipped Out' },
];

// Verify Shopify webhook
function verifyShopifyWebhook(req, res, next) {
  const hmac = req.headers['x-shopify-hmac-sha256'];
  const body = JSON.stringify(req.body);
  const digest = crypto
    .createHmac('sha256', process.env.SHOPIFY_WEBHOOK_SECRET)
    .update(body, 'utf8')
    .digest('base64');

  if (digest !== hmac) {
    return res.status(401).send('Unauthorized');
  }
  next();
}

// Slack notification
async function sendSlackNotification(orderId, stageName, timestamp) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  const message = {
    text: `📦 Order #${orderId} has progressed to "${stageName}" stage at ${timestamp}`,
  };

  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  });
}

// Email notification
async function sendEmailNotification(orderId, stageName, timestamp) {
  const msg = {
    to: process.env.EMAIL_TO,
    from: 'no-reply@yourshop.com',
    subject: `Order #${orderId} - ${stageName} Timestamp Created`,
    text: `Order #${orderId} has reached the "${stageName}" stage at ${timestamp}.`,
  };
  await sgMail.send(msg);
}

// Update stage timestamp if missing
async function updateStage(orderId, stage) {
  const order = await shopifyClient.get({ path: `orders/${orderId}/metafields` });
  const metafield = order.body.metafields.find(mf => mf.namespace === 'custom' && mf.key === stage.key);

  if (!metafield || !metafield.value) {
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

    await sendSlackNotification(orderId, stage.name, timestamp);
    await sendEmailNotification(orderId, stage.name, timestamp);

    console.log(`✅ Order #${orderId}: ${stage.name} timestamp created.`);
  }
}

// Handle Shopify order update webhook
app.post('/webhook/order-updated', verifyShopifyWebhook, async (req, res) => {
  const orderId = req.body.id;
  for (const stage of stages) {
    await updateStage(orderId, stage);
  }
  res.status(200).send('Webhook processed');
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Shopify Stage Notifier listening on port ${PORT}`);
});
