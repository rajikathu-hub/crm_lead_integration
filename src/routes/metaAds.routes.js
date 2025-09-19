import express from "express";
// import { metaAuthHandler, metaCallbackHandler, getMetaPagesHandler } from "../controllers/metaAds.controller.js";

// const router = express.Router();

// router.get("/auth", metaAuthHandler);
// router.get("/callback", metaCallbackHandler);
// router.get("/pages", getMetaPagesHandler);


// export default router;

import { connectMetaAds, getCampaigns, getLeads,exchangeToken,metaCallback,getForms } from "../controllers/metaAds.controller.js";
const router = express.Router();


// Connect Meta Ads
router.post("/connect",connectMetaAds);

// Get campaigns
router.get("/campaigns", getCampaigns);

// Get leads
router.get("/leads", getLeads);

router.post("/exchange-token", exchangeToken);

// OAuth callback
router.get("/callback", metaCallback);

router.get("/get-forms", getForms);

router.get("/leads", getLeads);

export default router;
