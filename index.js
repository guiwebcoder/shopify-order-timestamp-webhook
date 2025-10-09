import express from 'express';
import bodyParser from 'body-parser';
import crypto from 'crypto';
import { shopifyClient } from './shopifyClient.js';
import sgMail from '@sendgrid/mail';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { logMessage } from './logger.js';

dotenv.config();
sgMail.setApiKey(process.env.SENDGRID_API_KEY || '');

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

async function sendSlackNotification(orderId, stageName, timestamp) {
  try {
    if (!process.env.SLACK_WEBHOOK_URL) return;
    const message = { text: `📦 Order #${orderId} progressed to "${stageName}" at ${timestamp}` };
    await fetch(process.env.SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });
    logMessage(`Slack notification sent for Order #${orderId}, Stage: ${stageName}`);
  } catch (err) {
    logMessage(`❌ Slack error for Order #${orderId}, Stage: ${stageName}: ${err.message}`);
  }
}

async function sendEmailNotification(orderId, stageName, timestamp) {
  try {
    if (!process.env.SENDGRID_API_KEY || !process.env.EMAIL_TO) return;
    const msg = {
      to: process.env.EMAIL_TO,
      from: 'no-reply@yourshop.com',
      subject: `Order #${orderId} - ${stageName} Timestamp Created`,
      text: `Order #${orderId} has reached the "${stageName}" stage at ${timestamp}.`,
    };
    await sgMail.send(msg);
    logMessage(`Email notification sent for Order #${orderId}, Stage: ${stageName}`);
  } catch (err) {
    logMessage(`❌ Email error for Order #${orderId}, Stage: ${stageName}: ${err.message}`);
  }
}

async function notifyNewStages(orderId) {
  try {
    const order = await shopifyClient.get({ path: `orders/${orderId}/metafields` });
    const metafields = order.body.metafields || [];
    const notifications = [];

    for (const stage of stages) {
      const mf = metafields.find(m => m.namespace === 'custom' && m.key === stage.key);
      if (!mf || !mf.value) {
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
        notifications.push({ stageName: stage.name, timestamp });
      }
    }

    for (const note of notifications) {
      await sendSlackNotification(orderId, note.stageName, note.timestamp);
      await sendEmailNotification(orderId, note.stageName, note.timestamp);
      logMessage(`✅ Order #${orderId}: ${note.stageName} timestamp created & notified.`);
    }

    if (notifications.length === 0) logMessage(`Order #${orderId}: No new stages to notify.`);
  } catch (err) {
    logMessage(`❌ Error processing order #${orderId}: ${err.message}`);
  }
}

app.post('/webhook/order-updated', verifyShopifyWebhook, async (req, res) => {
  try {
    const orderId = req.body.id;
    if (!orderId) throw new Error('Missing order ID in webhook payload');
    await notifyNewStages(orderId);
    res.status(200).send('Webhook processed');
  } catch (err) {
    logMessage(`❌ Error handling webhook: ${err.message}`);
    res.status(500).send('Error processing webhook');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logMessage(`✅ Shopify Stage Notifier running on port ${PORT}`);
});
