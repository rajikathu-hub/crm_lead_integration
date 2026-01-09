import "dotenv/config";
import express from "express";
import cors from "cors";

// Import sub-applications
// Note: In NodeNext/ESM, we import the .js extension even for TS files
// @ts-ignore
import crmApp from "./CRM_Ads_Integration/src/app.js";

// @ts-ignore
import { app as razorpayApp } from "./RazorPay_Gateway/src/app.js";

const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());

// Request Logger
app.use((req, res, next) => {
    console.log(`[Gateway] ${req.method} ${req.url}`);
    next();
});

// Health Check for Gateway
app.get("/", (req, res) => {
    res.send("AceNode_Gateway is running. Available: /crm-ads, /payment");
});

// Mount CRM Ads Integration
// Mount path: /crm-ads
app.use("/crm-ads", crmApp);

// Mount RazorPay Gateway
// Mount path: /payment
app.use("/payment", razorpayApp);

app.listen(PORT, () => {
    console.log(`🚀 Gateway Server running at http://localhost:${PORT}`);
    console.log(`   - CRM Ads: /crm-ads`);
    console.log(`   - Payment: /payment`);
});
