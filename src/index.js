import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import { shopifyRequest } from "./shopifyClient.js";
import { log } from "./logger.js";

dotenv.config();

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

// Define your main → timestamp metafield mapping
const stagePairs = [
  { field: "sent_to_design_production", timestampField: "sent_to_design_production_timestamp" },
  { field: "pending_customer_approval", timestampField: "pending_customer_approval_timestamp" },
  { field: "production_initiated", timestampField: "production_initiated_timestamp" },
  { field: "in_production", timestampField: "in_production_timestamp" },
  { field: "cleaning_packaging", timestampField: "cleaning_packaging_timestamp" },
  { field: "packed_ready_to_ship", timestampField: "packed_ready_to_ship_timestamp" }
];

app.post("/update-order-timestamps", async (req, res) => {
  try {
    const { orderId, metafields } = req.body;

    for (const pair of stagePairs) {
      const currentValue = metafields[pair.field];

      // Update timestamp every time the value changes to "Yes"
      if (currentValue === "Yes") {
        await shopifyRequest(`orders/${orderId}/metafields`, "POST", {
          metafield: {
            namespace: "custom",
            key: pair.timestampField,
            value: new Date().toISOString(),
            type: "single_line_text_field"
          }
        });
        log(`Updated ${pair.timestampField} for order ${orderId}`);
      }
    }

    res.status(200).send({ message: "Timestamps updated successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).send({ error: "Failed to update timestamps" });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
