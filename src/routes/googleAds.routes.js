import { Router } from "express";
import {
  startGoogleAdsConnect,
  googleAdsCallback,
  selectCustomer,
  summaryLast7Days,
  getGoogleConnectionHandler,
  getGoogleSummaryHandler,
  getLeadsLast30Days
} from "../controllers/googleAds.controller.js";

const router = Router();

router.get("/connect", startGoogleAdsConnect);     // → /ads/google/connect
router.get("/callback", googleAdsCallback);        // → /ads/google/callback
router.post("/select-customer", selectCustomer);   // → /ads/google/select-customer
router.get("/summary", summaryLast7Days);          // → /ads/google/summary
router.get("/connection", getGoogleConnectionHandler); // → /ads/google/connection
router.get("/summary/db", getGoogleSummaryHandler);    // → /ads/google/summary/db
router.get("/leads", getLeadsLast30Days);              // → /ads/google/leads
router.get("/auth", (req, res) => {                    // alias
  const q = req.url.split("?")[1];
  const url = "/ads/google/connect" + (q ? `?${q}` : "");
  return res.redirect(url);
});

export default router;
