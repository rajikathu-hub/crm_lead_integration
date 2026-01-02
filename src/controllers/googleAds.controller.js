import { json } from "express";
import {
    getGoogleAdsAuthUrl,
    exchangeAdsCode,
    listAccessibleCustomers,
    setSelectedCustomerId,
    searchStreamGAQL,
  } from "../services/googleAds.service.js";
  import { getGoogleConnection, getGoogleSummary } from "../services/googleDb.service.js";
  import { mem } from "../store/memory.js";
  
  export function startGoogleAdsConnect(_req, res) {
    res.redirect(getGoogleAdsAuthUrl());
  }
  
  export async function googleAdsCallback(req, res) {
    try {
      const { code,state } = req.query;
      //console.log("Google callback, code =", code);
      if (!code) return res.status(400).json({ error: "Missing code" });
  
      const userId = state || 1; // ← add this line
      await exchangeAdsCode(code, userId);          // ← pass userId here
      //console.log("after token");

      const resourceNames = await listAccessibleCustomers();
      // res.json({
      //   message: "Google Ads connected. Choose a customer to proceed.",
      //   accessibleCustomerResourceNames: resourceNames,
      //   tip: "POST one resourceName to /ads/google/select-customer",
      // });

      res.redirect(`${process.env.FRONTEND_URL}/auth/callback?platform=google&success=true&customers=${encodeURIComponent(JSON.stringify(resourceNames))}`);

    } catch (e) {
      res.status(400).json({ error: e?.response?.data || e.message });
    }
  }
  
  
  export async function selectCustomer(req, res) {
    try {
      const userId = (req.query.userId || 1);   // ← add this
      
      const { customerResourceName } = req.body || {};
      const id = await setSelectedCustomerId(customerResourceName, userId); // ← pass userId
      res.json({ ok: true, selectedCustomerId: id });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  }
  
  
  export async function summaryLast7Days(req, res) {
    try {
      const userId = req.query.userId || 1; // ← add
      const GAQL = `
        SELECT
          campaign.id, campaign.name,
          metrics.impressions, metrics.clicks, metrics.cost_micros
        FROM campaign
        WHERE segments.date DURING LAST_7_DAYS
        ORDER BY metrics.impressions DESC
        LIMIT 20
      `;
      const rows = await searchStreamGAQL(GAQL, userId); // ← pass userId
      res.json({
        customerId: mem.googleAds.selectedCustomerId,
        items: rows.map(r => ({
          campaignId: r.campaign?.id,
          campaignName: r.campaign?.name,
          impressions: r.metrics?.impressions,
          clicks: r.metrics?.clicks,
          costMicros: r.metrics?.costMicros,
        })),
      });
    } catch (e) {
      res.status(400).json({ error: e?.response?.data || e.message });
    }
  }

  export async function getLeadsLast30Days(req, res) {
    try {
      const userId = req.query.userId || 1;
  
      // Calculate last 30 days
      const today = new Date();
      const past30 = new Date();
      past30.setDate(today.getDate() - 90);
      const fromDate = past30.toISOString().split("T")[0]; // YYYY-MM-DD
  
      // GAQL query
      const GAQL = `
        SELECT
          lead_form_submission_data.asset,
          asset.id,
          asset.name,
          campaign.id,
          campaign.name,
          ad_group.id,
          ad_group.name,
          lead_form_submission_data.gclid,
          lead_form_submission_data.submission_date_time,
          lead_form_submission_data.lead_form_submission_fields
        FROM lead_form_submission_data
        WHERE lead_form_submission_data.submission_date_time >= '${fromDate} 00:00:00'
        ORDER BY lead_form_submission_data.submission_date_time DESC
        LIMIT 200
      `;
  
      const rows = await searchStreamGAQL(GAQL, userId);
 
      res.json({
        customerId: mem.googleAds.selectedCustomerId,
        count: rows.length,
        leads: rows.map(r => ({
          asset: r.leadFormSubmissionData?.asset,
          assetId: r.asset?.id,
          assetName: r.asset?.name,            // ✅ Lead form name
          campaignId: r.campaign?.id,
          campaignName: r.campaign?.name,
          adGroupId: r.adGroup?.id,
          adGroupName: r.adGroup?.name,
          gclid: r.leadFormSubmissionData?.gclid,
          submissionDateTime: r.leadFormSubmissionData?.submissionDateTime,
          leadId:`${r.gclid}_${r.submissionDateTime}`,
          fields: r.leadFormSubmissionData?.leadFormSubmissionFields
        }))
      });
    } catch (e) {
      res.status(400).json({ error: e?.response?.data || e.message });
    }
  }
   
  export async function getGoogleConnectionHandler(req, res) {
    try {
      const { userId } = req.query;
      if (!userId) {
        return res.status(400).json({ error: "userId required" });
      }
  
      const connection = await getGoogleConnection(userId);
  
      if (!connection) {
        return res.status(404).json({ error: "No Google Ads connection found" });
      }
  
      res.json(connection);
    } catch (err) {
      console.error("Error fetching Google connection:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  }

  export async function getGoogleSummaryHandler(req, res) {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ error: "userId required" });
    }

    const summary = await getGoogleSummary(userId);

    if (!summary) {
      return res.status(404).json({ error: "No summary found for this user" });
    }

    res.json(summary);
  } catch (err) {
    console.error("Error in getGoogleSummaryHandler:", err);
    res.status(500).json({ error: "Internal server error" });
  }
}
  
  
  