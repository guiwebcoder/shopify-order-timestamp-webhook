import express from 'express';
import bodyParser from 'body-parser';
import crypto from 'crypto';
import fetch from 'node-fetch';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import advancedFormat from 'dayjs/plugin/advancedFormat.js';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(advancedFormat);

const app = express();
app.use(bodyParser.raw({ type: 'application/json' }));

const {
    SHOPIFY_STORE,
    ADMIN_API_KEY,
    ADMIN_API_PASSWORD,
    SHOPIFY_WEBHOOK_SECRET,
    WEBHOOK_URL,
    PORT
} = process.env;

// Logging helper
function log(message) {
    console.log(message);
    fs.appendFileSync('./logs/webhook.log', `[${new Date().toISOString()}] ${message}\n`);
}

// HMAC verification
function verifyShopifyHmac(req) {
    const hmac = req.headers['x-shopify-hmac-sha256'];
    const hash = crypto
        .createHmac('sha256', SHOPIFY_WEBHOOK_SECRET)
        .update(req.body)
        .digest('base64');
    return hash === hmac;
}

// Format timestamp
function formatTimestamp(date) {
    return dayjs(date).tz('Asia/Kolkata').format('dddd, MMMM D, YYYY | h:mm A');
}

// Register webhook automatically
async function registerWebhook() {
    try {
        const url = `https://${SHOPIFY_STORE}/admin/api/2025-10/webhooks.json`;
        const body = {
            webhook: {
                topic: 'orders/updated',
                address: WEBHOOK_URL,
                format: 'json'
            }
        };

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic ' + Buffer.from(`${ADMIN_API_KEY}:${ADMIN_API_PASSWORD}`).toString('base64')
            },
            body: JSON.stringify(body)
        });

        const data = await res.json();
        log('Webhook registration result: ' + JSON.stringify(data));
    } catch (err) {
        log('Error registering webhook: ' + err.message);
    }
}

// Handle webhook
app.post('/webhook/order-updated', async (req, res) => {
    try {
        if (!verifyShopifyHmac(req)) {
            log('Unauthorized request');
            return res.status(401).send('Unauthorized');
        }

        const order = JSON.parse(req.body.toString('utf-8'));
        const orderId = order.id;

        const sentToDesignMetafield = order.metafields?.find(
            (mf) => mf.namespace === 'custom' && mf.key === 'sent_to_design_production'
        );

        if (!sentToDesignMetafield) {
            return res.status(200).send('No sent_to_design_production metafield');
        }

        // Fetch all metafields to get timestamp metafield
        const metafieldsRes = await fetch(
            `https://${SHOPIFY_STORE}/admin/api/2025-10/orders/${orderId}/metafields.json`,
            {
                headers: {
                    'Authorization': 'Basic ' + Buffer.from(`${ADMIN_API_KEY}:${ADMIN_API_PASSWORD}`).toString('base64'),
                    'Content-Type': 'application/json'
                }
            }
        );

        const metafieldsData = await metafieldsRes.json();
        const metafields = metafieldsData.metafields || [];

        const timestampMetafield = metafields.find(
            (mf) => mf.namespace === 'custom' && mf.key === 'sent_to_design_production_timestamp'
        );

        const timestamp = formatTimestamp(new Date());
        const metafieldId = timestampMetafield ? timestampMetafield.id : null;

        const url = metafieldId
            ? `https://${SHOPIFY_STORE}/admin/api/2025-10/orders/${orderId}/metafields/${metafieldId}.json`
            : `https://${SHOPIFY_STORE}/admin/api/2025-10/orders/${orderId}/metafields.json`;

        const body = metafieldId
            ? { metafield: { id: metafieldId, value: timestamp, type: 'single_line_text_field' } }
            : {
                  metafield: {
                      namespace: 'custom',
                      key: 'sent_to_design_production_timestamp',
                      value: timestamp,
                      type: 'single_line_text_field'
                  }
              };

        const response = await fetch(url, {
            method: metafieldId ? 'PUT' : 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic ' + Buffer.from(`${ADMIN_API_KEY}:${ADMIN_API_PASSWORD}`).toString('base64')
            },
            body: JSON.stringify(body)
        });

        const data = await response.json();
        log(`Timestamp updated for order ${orderId}: ${JSON.stringify(data)}`);

        res.status(200).send('Timestamp updated successfully');
    } catch (err) {
        log('Error processing webhook: ' + err.message);
        res.status(500).send('Internal Server Error');
    }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    log(`Webhook listener running on port ${PORT}`);
    registerWebhook(); // auto-register webhook on server start
});