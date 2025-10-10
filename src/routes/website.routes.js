import express from "express";
import { connectWebsite, leadsReceiver, getWebsiteLeads } from "../controllers/website.controller.js";

const router = express.Router();

// Save API key for Website (connect integration)
router.post("/api/ads/website/connect", connectWebsite)

// To receive leads from Website
router.get("/api/ads/website/leads", leadsReceiver);

// Fetch Website Leads
router.get("/leads/website/:user_id", getWebsiteLeads);

export default router;
