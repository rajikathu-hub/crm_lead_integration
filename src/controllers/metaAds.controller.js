// // STEP 1: Redirect user to Meta OAuth login
// export async function metaAuthHandler(req, res) {
//   console.log(">>> Meta auth endpoint hit");   // log request

//   const { userId } = req.query;
//   if (!userId) {
//     console.error("❌ Missing userId in query");
//     return res.status(400).json({ error: "userId required" });
//   }

//   const authUrl =
//     "https://www.facebook.com/v18.0/dialog/oauth?" +
//     querystring.stringify({
//       client_id: META_APP_ID,
//       redirect_uri: META_REDIRECT_URI,
//       scope: "ads_management,ads_read,business_management",
//       state: userId,
//     });

//   console.log("✅ Redirecting to Meta Auth URL:", authUrl);
//   res.redirect(authUrl);
// }

// // STEP 2: Handle Meta callback
// export async function metaCallbackHandler(req, res) {
//   console.log(">>> Meta callback endpoint hit");
//   console.log("Query params:", req.query);

//   const { code, state } = req.query;
//   if (!code || !state) {
//     console.error("❌ Missing code or state in callback");
//     return res.status(400).json({ error: "Missing code or userId" });
//   }

//   try {
//     const tokenUrl =
//       "https://graph.facebook.com/v18.0/oauth/access_token?" +
//       querystring.stringify({
//         client_id: META_APP_ID,
//         client_secret: META_APP_SECRET,
//         redirect_uri: META_REDIRECT_URI,
//         code,
//       });

//     console.log("📡 Fetching token from:", tokenUrl);

//     const tokenRes = await fetch(tokenUrl);
//     const tokenData = await tokenRes.json();
//     console.log("📥 Token response:", tokenData);

//     if (tokenData.error) {
//       console.error("❌ Meta token error:", tokenData.error);
//       return res.status(500).json({ error: "Failed to fetch access token" });
//     }

//     const accessToken = tokenData.access_token;
//     console.log("✅ Access token received");

//     const db = await getDb();
//     await db.query(
//       `INSERT INTO api_connections (user_id, platform_name, token, status)
//        VALUES (?, ?, ?, ?)
//        ON DUPLICATE KEY UPDATE token = VALUES(token), status = VALUES(status)`,
//       [state, "MetaAds", accessToken, "active"]
//     );

//     console.log("✅ Token saved to DB for user:", state);
//     res.send("✅ Meta Ads connected successfully! You can close this window.");
//   } catch (err) {
//     console.error("❌ Meta callback error:", err);
//     res.status(500).json({ error: "Internal server error" });
//   }
// }

// export async function getMetaPagesHandler(req, res) {
//   try {
//     const { userId } = req.query;
//     if (!userId) return res.status(400).json({ error: "userId required" });

//     const db = await getDb();
//     const [rows] = await db.query(
//       "SELECT token FROM api_connections WHERE user_id = ? AND platform_name = 'MetaAds'",
//       [userId]
//     );

//     if (!rows.length) return res.status(404).json({ error: "No Meta Ads connection found" });

//     const token = rows[0].token;

//     const response = await fetch(
//       `https://graph.facebook.com/v18.0/me/accounts?access_token=${token}`
//     );
//     const data = await response.json();

//     res.json(data);
//   } catch (err) {
//     console.error("Meta pages fetch error:", err);
//     res.status(500).json({ error: "Internal server error" });
//   }
// }

import axios from "axios";
import { getDb } from "../db.js";
const db = await getDb();

/** Save Meta Ads token when user connects */
export const connectMetaAds = async (req, res) => {
  const { userId, accessToken } = req.body;
  const db = await getDb();

  try {
    const { error } = await db
      .from("intg_api_connections")
      .upsert(
        {
          user_id: userId,
          platform_name: "meta_ads",
          token: accessToken,
          status: "connected",
        },
        { onConflict: "user_id,platform_name" }
      );

    if (error) throw error;

    res.json({ ok: true, message: "Meta Ads connected successfully" });
  } catch (err) {
    console.error("Error saving Meta Ads token:", err.message);
    res.status(500).json({ error: "Database error" });
  }
};

/** Fetch campaigns */
export const getCampaigns = async (req, res) => {
  const { userId } = req.query;
  const db = await getDb();

  try {
    const { data: row, error } = await db
      .from("intg_api_connections")
      .select("token, page_id, page_access_token")
      .eq("user_id", userId)
      .eq("platform_name", "meta_ads")
      .maybeSingle();

    if (error) throw error;
    if (!row) {
      return res.status(400).json({ error: "No Meta Ads token found" });
    }

    
    const userToken = row.token;
    const pageId = row.page_id;
    const pageToken = row.page_access_token;

    // ============================================
    // ⭐ NEW: Ensure page is connected
    // ============================================
    if (!pageId || !pageToken) {
      return res.status(400).json({
        error: "Meta Ads must be connected first (missing page_id/page_access_token)"
      });
    }

    // ============================================
    // ⭐ NEW: Get Business Accounts for this page
    // ============================================
    const businessResp = await axios.get(
      `https://graph.facebook.com/v21.0/${pageId}?fields=business&access_token=${pageToken}`
    );

    const businessId = businessResp.data?.business?.id;

    if (!businessId) {
      return res.json({
        ok: true,
        message: "Page has no business linked. Campaigns cannot be fetched."
      });
    }

    // ============================================
    // ⭐ NEW: Get ad accounts under this business
    // ============================================
    const adAccResp = await axios.get(
      `https://graph.facebook.com/v21.0/${businessId}/owned_ad_accounts?fields=id,name,account_status&access_token=${pageToken}`
    );

    const adAccounts = adAccResp.data?.data || [];

    if (adAccounts.length === 0) {
      return res.json({
        ok: true,
        message: "No ad accounts linked to this business."
      });
    }

    // Use the first ad account
    const adAccountId = adAccounts[0].id;

    // ============================================
    // ⭐ NEW: Fetch Campaigns from Ad Account
    // ============================================
    const campaignResp = await axios.get(
      `https://graph.facebook.com/v21.0/${adAccountId}/campaigns?fields=id,name,status,objective&access_token=${pageToken}`
    );

    return res.json({
      ok: true,
      businessId,
      adAccountId,
      campaigns: campaignResp.data.data || []
    });
    
  } catch (err) {
    console.error("Error fetching campaigns:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to fetch campaigns" });
  }
};

/** Fetch leads from a lead form */
export const getLeads = async (req, res) => {
  const { userId, formId, startDate, endDate } = req.query;
  const db = await getDb();

  try {

    if (!formId) {
      return res.status(400).json({ error: "formId is required" });
    }

    let fromDate = null;
    let toDate = null;
    if (startDate && endDate) {
      fromDate = new Date(`${startDate}T00:00:00Z`);
      toDate = new Date(`${endDate}T23:59:59Z`);
      
      if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
        return res.status(400).json({ error: "Invalid date format" });
      }

      if (fromDate > toDate) {
        return res.status(400).json({ error: "startDate cannot be after endDate" });
      }
    }
    
    // Step 1: Get user token
    const { data: row, error } = await db
      .from("intg_api_connections")
      .select("token, page_id, page_access_token, page_name")
      .eq("user_id", userId)
      .eq("platform_name", "meta_ads")
      .maybeSingle();

    if (error) throw error;
    if (!row) {
      return res.status(400).json({ error: "No Meta Ads token found" });
    }
  
    const userToken = row.token;
    const pageId = row.page_id;
    const pageToken = row.page_access_token;
    const pageName = row.page_name;

    // ============================================
    // ⭐ NEW: Ensure page is connected
    // ============================================
    if (!pageId || !pageToken) {
      return res.status(400).json({
        error: "Meta Ads page not connected. Missing page_id or page_access_token."
      });
    }

    let collectedLeads = [];

    // ============================================
    // ⭐ NEW: Fetch forms for this page
    // ============================================
    const formsResp = await axios.get(
      `https://graph.facebook.com/v21.0/${pageId}/leadgen_forms?fields=id,name&access_token=${pageToken}`
    );

    const forms = formsResp.data.data || [];

    // ============================================
    // ⭐ NEW: Process leads for each form
    // ============================================
    for (const form of forms) {

      if (formId && form.id !== formId) continue; // 🔥 Restriction

      const leadsResp = await axios.get(
        `https://graph.facebook.com/v21.0/${form.id}/leads?fields=created_time,field_data&access_token=${pageToken}`
      );

      for (const lead of leadsResp.data.data || []) {

        const createdTime = new Date(lead.created_time);
         
        if (fromDate && createdTime < fromDate) continue;
        if (toDate && createdTime > toDate) continue;

        // ============================================
        // ⭐ NEW: Prevent duplicate leads
        // ============================================
        const leadString = JSON.stringify(lead);

        const { data: exists, error } = await db.from("intg_leads")
        .select("id")
        .eq("user_id", userId)
        .eq("platform", "meta_ads")
        .eq("lead_data", leadString)
        .limit(1)
        .maybeSingle();
 
        if (!exists) {
          // Store in DB (existing logic)
          const { error: leadErr } = await db.from("intg_leads").insert({
            user_id: userId,
            platform: "meta_ads",
            lead_data: leadString, // Supabase can store JSON directly if column type is `jsonb`
          });
          if (leadErr) console.error("Insert lead error:", leadErr.message);
        }

        // Push to response list
        collectedLeads.push({
          id: lead.id,             // ✅ Meta Lead ID
          formId: form.id,          // ✅ Meta Form ID
          pageName,
          formName: form.name,
          created_time: lead.created_time,
          data: lead.field_data,
        });
      }
    }

    // Existing logic stays
    if (collectedLeads.length === 0) {
      return res.json({ ok: true, message: "No leads found on any form" });
    }

    res.json({ ok: true, leads: collectedLeads });
  } 
  catch (err) {
    console.error("Error fetching leads:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to fetch leads" });
  }
};

const APP_ID = process.env.META_APP_ID;
const APP_SECRET = process.env.META_APP_SECRET;
const REDIRECT_URI = process.env.META_REDIRECT_URI;

// Exchange Auth Code → Long-Lived Token
export const exchangeToken = async (req, res) => {
  const { userId, code } = req.body;

  try {
    // Step 1: Exchange code for short-lived user token
    const shortResp = await axios.get(
      `https://graph.facebook.com/v21.0/oauth/access_token`, {
        params: {
          client_id: APP_ID,
          redirect_uri: REDIRECT_URI,
          client_secret: APP_SECRET,
          code
        }
      }
    );

    const shortToken = shortResp.data.access_token;

    // Step 2: Exchange short token for long-lived token
    const longResp = await axios.get(
      `https://graph.facebook.com/v21.0/oauth/access_token`, {
        params: {
          grant_type: "fb_exchange_token",
          client_id: APP_ID,
          client_secret: APP_SECRET,
          fb_exchange_token: shortToken
        }
      }
    );

    const longToken = longResp.data.access_token;

     // ===============================
    // ⭐ NEW LOGIC ADDED: Fetch Pages
    // ===============================
    const pagesResp = await axios.get(
      `https://graph.facebook.com/v21.0/me/accounts?access_token=${longToken}`
    );

    let selectedPage = null;

    if (pagesResp.data?.data?.length > 0) {
      // Pick first page (or you can later add UI for selection)
      selectedPage = pagesResp.data.data[0];
    }

    const pageId = selectedPage?.id || null;
    const pageName = selectedPage?.name || null;
    const pageAccessToken = selectedPage?.access_token || null;

    // ===============================
    // ⭐ SAVE EVERYTHING
    // (Keeps your existing insert logic)
    // ===============================
    await db.query(
      `INSERT INTO api_connections 
        (user_id, platform_name, token, status, page_id, page_name, page_access_token)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE 
          token = VALUES(token),
          status = VALUES(status),
          page_id = VALUES(page_id),
          page_name = VALUES(page_name),
          page_access_token = VALUES(page_access_token)`,
      [
        userId,
        "meta_ads",
        longToken,            // Keep saving USER token as per your old logic
        "connected",
        pageId,               // NEW
        pageName,             // NEW
        pageAccessToken       // NEW
      ]
    );

    res.json({
      ok: true,
      message: "Meta Ads connected successfully",
      userToken: longToken,
      pageId,
      pageName,
      pageAccessToken
    });
  } catch (err) {
    console.error("Error exchanging Meta Ads token:", err.response?.data || err);
    res.status(500).json({ error: "Failed to exchange token" });
  }
};


// Handle redirect from Meta OAuth
export const metaCallback = async (req, res) => {
  const { code, state } = req.query; // state = userId
  console.log("Meta callback hit with query:", req.query);
  if (!code) {
    // return res.status(400).json({ error: "Missing code from Meta callback" });
    return res.redirect(`${FRONTEND_URL}/auth/callback?platform=meta_ads&success=false`);
  }

  try {
    // Step 1: Exchange code for short-lived token
    const shortResp = await axios.get(
      `https://graph.facebook.com/v21.0/oauth/access_token`,
      {
        params: {
          client_id: APP_ID,
          redirect_uri: REDIRECT_URI,
          client_secret: APP_SECRET,
          code,
        },
      }
    );
    const shortToken = shortResp.data.access_token;
    
    // Step 2: Exchange for long-lived token
    const longResp = await axios.get(
      `https://graph.facebook.com/v21.0/oauth/access_token`,
      {
        params: {
          grant_type: "fb_exchange_token",
          client_id: APP_ID,
          client_secret: APP_SECRET,
          fb_exchange_token: shortToken,
        },
      }
    );
    const longToken = longResp.data.access_token;
   
    // ==========================================
    // ⭐ NEW LOGIC ADDED — Fetch Pages
    // ==========================================
    const pagesResp = await axios.get(
      `https://graph.facebook.com/v21.0/me/accounts?access_token=${longToken}`
    );

    let selectedPage = null;

    if (pagesResp.data?.data?.length > 0) {
      // pick the first page (later UI selection can be added)
      selectedPage = pagesResp.data.data[0];
    }

    const pageId = selectedPage?.id || null;
    const pageName = selectedPage?.name || null;
    const pageAccessToken = selectedPage?.access_token || null;

    // ==========================================
    // ⭐ SAVE ALL DATA (keeping your original insert)
    // ==========================================
    const userId = state || 1; // fallback for testing  

    const db = await getDb();
    const {error } = await db
      .from("intg_api_connections")
      .upsert(
        {
          user_id: userId,
          platform_name: "meta_ads",
          token: longToken,
          status: "connected",
          page_id:pageId,
          page_name:pageName,
          page_access_token:pageAccessToken
        },
        { onConflict: "user_id,platform_name" }
      );
       
    if (error) throw error;

    // response
    // res.json({
    //   ok: true,
    //   message: "Meta Ads connected",
    //   userToken: longToken,
    //   pageId,
    //   pageName,
    //   pageAccessToken
    // });

    res.redirect(`${process.env.FRONTEND_URL}/auth/callback?platform=meta_ads&success=true`);
  } catch (err) {
    console.error("Error in Meta callback:", err.response?.data || err.message);
    // res.status(500).json({ error: "Meta callback failed" });
    res.redirect(`${process.env.FRONTEND_URL}/auth/callback?platform=meta_ads&success=false`);
  }
};

// Get all lead forms for user's pages
export const getForms = async (req, res) => {
  const { userId } = req.query;

  try {
    // Step 1: Get token from Supabase
    const db = await getDb();
    const { data:row, error } = await db
      .from("intg_api_connections")
      .select("token, page_id, page_access_token, page_name")
      .eq("user_id", userId)
      .eq("platform_name", "meta_ads")
      .single();

    if (error || !row) {
      return res.status(400).json({ error: "No Meta Ads token found" });
    }

    const userToken = row.token;
    const pageId = row.page_id;
    const pageToken = row.page_access_token;
    const pageName = row.page_name;
 
    // ============================================
    // ⭐ NEW LOGIC ADDED — Use stored page token
    // ============================================
    if (!pageId || !pageToken) {
      return res.status(400).json({
        error: "Meta Ads page not connected properly. Missing page_id or page_access_token."
      });
    }

    // Step 2 (new): Fetch forms directly from saved page_id
    const formResp = await axios.get(
      `https://graph.facebook.com/v21.0/${pageId}/leadgen_forms?fields=id,name&access_token=${pageToken}`
    );
 
    const forms = [
      {
        pageId,
        pageName,
        forms: formResp.data?.data || []
      }
    ];

    // Step 3: Return the correct response
    return res.json({
      ok: true,
      forms
    });
  } catch (err) {
    console.error("Error fetching forms:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to fetch forms" });
  }
};



