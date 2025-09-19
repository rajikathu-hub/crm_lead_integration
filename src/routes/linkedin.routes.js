import express from "express";
import { linkedinCallback, linkedinLogin, getAdAccounts, getCampaigns, getLeadForms } from "../controllers/linkedin.controller.js";

const router = express.Router();

// LinkedIn OAuth callback
router.get("/auth/linkedin/login", linkedinLogin);
router.get("/auth/linkedin/callback", linkedinCallback);
router.get("/api/ads/linkedin/accounts", getAdAccounts);
router.get("/api/ads/linkedin/campaigns", getCampaigns);
router.get("/api/ads/linkedin/forms", getLeadForms);

export default router;
