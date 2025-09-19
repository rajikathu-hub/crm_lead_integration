import express from "express";
import { connectIndiaMart, fetchIndiaMartLeads } from "../controllers/indiamart.controller.js";

const router = express.Router();

// Save API key for IndiaMART (connect integration)
router.post("/api/ads/indiamart/connect", connectIndiaMart)

// Fetch leads from IndiaMART
router.get("/api/ads/indiamart/leads", fetchIndiaMartLeads);

export default router;
