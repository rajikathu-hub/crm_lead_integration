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
      .select("token")
      .eq("user_id", userId)
      .eq("platform_name", "meta_ads")
      .maybeSingle();

    if (error) throw error;
    if (!row) {
      return res.status(400).json({ error: "No Meta Ads token found" });
    }

    const accessToken = row.token;

    const response = await axios.get(
      `https://graph.facebook.com/v21.0/me/adaccounts`,
      {
        params: {
          fields: "id,name,account_status",
          access_token: accessToken,
        },
      }
    );

    res.json(response.data);
  } catch (err) {
    console.error("Error fetching campaigns:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to fetch campaigns" });
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

    // Step 3: Save into api_connections
    await db.query(
      `INSERT INTO intg_api_connections (user_id, platform_name, token, status)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE token = VALUES(token), status = VALUES(status)`,
      [userId, "meta_ads", longToken, "connected"]
    );

    res.json({ ok: true, message: "Meta Ads connected", token: longToken });
  } catch (err) {
    console.error("Error exchanging Meta Ads token:", err.response?.data || err);
    res.status(500).json({ error: "Failed to exchange token" });
  }
};

/** Fetch leads from a lead form */
export const getLeads = async (req, res) => {
  const { userId, formId } = req.query;
  const db = await getDb();

  try {
    // Step 1: Get user token
    const { data: row, error } = await db
      .from("intg_api_connections")
      .select("token")
      .eq("user_id", userId)
      .eq("platform_name", "meta_ads")
      .maybeSingle();

    if (error) throw error;
    if (!row) {
      return res.status(400).json({ error: "No Meta Ads token found" });
    }

    const userToken = row.token;
    
    // Step 2: Get pages for the user
    const pagesResp = await axios.get(
      `https://graph.facebook.com/v21.0/me/accounts`,
      { params: { access_token: userToken } }
    );

    let leads = [];

    // Step 3: Try fetching leads from the form for each page
    for (const page of pagesResp.data.data) {
      const pageToken = page.access_token;

      try {
        const leadsResp = await axios.get(
          `https://graph.facebook.com/v21.0/${formId}/leads`,
          {
            params: {
              fields: "created_time,field_data",
              access_token: pageToken,
            },
          }
        );

        // Step 4: Save each lead into Supabase
        for (const lead of leadsResp.data.data) {
          const { error: leadErr } = await db.from("intg_leads").insert({
            user_id: userId,
            platform: "meta_ads",
            lead_data: lead, // Supabase can store JSON directly if column type is `jsonb`
          });
          if (leadErr) console.error("Insert lead error:", leadErr.message);
        }

        // Collect for response
        leads = leads.concat(leadsResp.data.data);
      } catch (innerErr) {
        // If page doesn’t own the form, skip
        continue;
      }
    }

    // Step 5: Return
    if (leads.length === 0) {
      return res.json({ ok: true, message: "No leads found for this form" });
    }

    res.json({ ok: true, leads });
  } catch (err) {
    console.error("Error fetching leads:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to fetch leads" });
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
   
    // Save token into Supabase
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
        },
        { onConflict: "user_id,platform_name" }
      );
       
    if (error) throw error;

    // res.json({ ok: true, message: "Meta Ads connected", token: longToken });
    res.redirect(`${process.env.FRONTEND_URL}/auth/callback?platform=meta_ads&success=true`);
  } catch (err) {
    console.error("Error in Meta callback:", err.response?.data || err.message);
    // res.status(500).json({ error: "Meta OAuth failed" });
    res.redirect(`${process.env.FRONTEND_URL}/auth/callback?platform=meta_ads&success=false`);
  }
};

// Get all lead forms for user's pages
export const getForms = async (req, res) => {
  const { userId } = req.query;

  try {
    // Step 1: Get token from Supabase
    const db = await getDb();
    const { data, error } = await db
      .from("intg_api_connections")
      .select("token")
      .eq("user_id", userId)
      .eq("platform_name", "meta_ads")
      .single();

    if (error || !data) {
      return res.status(400).json({ error: "No Meta Ads token found" });
    }

    const userToken = data.token;

    // Step 2: Get connected pages
    const pagesResp = await axios.get(
      `https://graph.facebook.com/v21.0/me/accounts?access_token=${userToken}`
    );

    let forms = [];

    // Step 3: Fetch forms for each page
    for (const page of pagesResp.data.data) {
      const pageId = page.id;
      const pageToken = page.access_token;

      const formResp = await axios.get(
        `https://graph.facebook.com/v21.0/${pageId}/leadgen_forms?fields=id,name&access_token=${pageToken}`
      );

      forms.push({
        pageId,
        pageName: page.name,
        forms: formResp.data.data,
      });
    }

    res.json({ ok: true, forms });
  } catch (err) {
    console.error("Error fetching forms:", err.response?.data || err.message);
    res.status(500).json({ error: "Failed to fetch forms" });
  }
};



