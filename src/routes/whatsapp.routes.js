// routes/whatsapp.js
import express from "express";
import { connectWhatsApp, whatsappWebhook, getWhatsAppLeads } from "../controllers/whatsapp.controller.js";

const router = express.Router();

// Save API Key
router.post("/connect/whatsapp", connectWhatsApp);

// Webhook (Stromx pushes leads here)
router.post("/webhook/whatsapp", whatsappWebhook);

// Fetch WhatsApp Leads
router.get("/leads/whatsapp/:user_id", getWhatsAppLeads);

export default router;
