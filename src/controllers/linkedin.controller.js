import { getDb } from "../db.js";
import axios from "axios";

const db = await getDb();

/**
 * STEP 1: Login URL Generator
 */
export const linkedinLogin = (req, res) => {

  console.log("xxxxxxxxxxxxxx"); // DEBUG

  const authUrl =
    "https://www.linkedin.com/oauth/v2/authorization" +
    "?response_type=code" +
    `&client_id=${process.env.LINKEDIN_CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(process.env.LINKEDIN_REDIRECT_URI)}` +
    "&scope=openid%20profile%20email%20r_ads";

  res.json({ url: authUrl });
};



/**
 * STEP 2: Callback Handler
 */
export const linkedinCallback = async (req, res) => {
  console.log("Callback query params:", req.query); // DEBUG

  const code = req.query.code;
  const error = req.query.error;
  const userId = req.query.state || 1;
   
  if (error) {
    return res.status(400).json({ error: "LinkedIn returned an error", details: req.query });
  }

  if (!code) {
    return res.status(400).json({ error: "Authorization code not found", details: req.query });
  }

  try {
    const tokenResponse = await axios.post(
      "https://www.linkedin.com/oauth/v2/accessToken",
      new URLSearchParams({
        grant_type: "authorization_code",
        code: code,
        redirect_uri: process.env.LINKEDIN_REDIRECT_URI,
        client_id: process.env.LINKEDIN_CLIENT_ID,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET,
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const { access_token } = tokenResponse.data;

    const db = await getDb();

    const { error: upsertError } = await db
      .from("intg_api_connections")
      .upsert(
        {
          user_id: userId,
          platform_name: "linkedin",
          token: access_token,
          status: "connected",
        },
        { onConflict: "user_id,platform_name" } // composite unique key must exist
      );

    if (upsertError) throw upsertError;

    // res.json({ message: "LinkedIn connected successfully ✅", token: access_token });
    res.redirect(`${process.env.FRONTEND_URL}/auth/callback?platform=linkedin&success=true`);

  } catch (error) {
    console.error("LinkedIn change Error:", error.response?.data || error.message);
    // res.status(500).json({ error: error.response?.data || error.message });
    res.redirect(`${process.env.FRONTEND_URL}/auth/callback?platform=linkedin&success=false`);
  }
};


/**
 * STEP 3: Get Ad Accounts
 */
export const getAdAccounts = async (req, res) => {
  const userId = req.query.userId || 1;

  try {
    const db = await getDb();

    // 1. Get token from Supabase
    const { data, error } = await db
      .from("intg_api_connections")
      .select("token")
      .eq("user_id", userId)
      .eq("platform_name", "linkedin")
      .single();

    if (error || !data) {
      return res.json({ ok: false, message: "No LinkedIn API key found" });
    }

    const token = data.token;

    // 2. Fetch Ad Accounts
    const response = await axios.get(
      "https://api.linkedin.com/v2/adAccountsV2?q=search",
      { headers: { Authorization: `Bearer ${token}` } }
    );
   
    res.json({ ok: true, accounts: response.data });
  } catch (error) {
    console.error("LinkedIn Ad Accounts Error:", error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data || error.message });
  }
};

export const getCampaigns = async (req, res) => {
  const userId = req.query.userId || 1;
  const accountId = req.query.accountId; // numeric

  if (!accountId) {
    return res.status(400).json({ error: "accountId is required" });
  }

  try {
    const [rows] = await db.query(
      "SELECT token FROM api_connections WHERE user_id=? AND platform_name=?",
      [userId, "linkedin"]
    );

    if (!rows || rows.length === 0) {
      return res.json({ ok: false, message: "No LinkedIn API key found" });
    }

    const token = rows[0].token;

    const accountUrn = `urn:li:sponsoredAccount:${accountId}`;

    const response = await axios.get(
      `https://api.linkedin.com/v2/adCampaignsV2?q=search&search.account.values[0]=${accountUrn}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    res.json({ ok: true, campaigns: response.data });
  } catch (error) {
    console.error("LinkedIn Campaigns Error:", error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data || error.message });
  }
};

export const getLeadForms = async (req, res) => {
  const userId = req.query.userId || 1;
  const accountId = req.query.accountId;

  if (!accountId) {
    return res.status(400).json({ error: "accountId is required" });
  }

  try {
    // 1. Get token
    const db = await getDb();
 
    const { data, error } = await db
      .from("intg_api_connections")
      .select("token")
      .eq("user_id", userId)
      .eq("platform_name", "linkedin")
      .single();

    if (error || !data) {
      return res.json({ ok: false, message: "No LinkedIn API key found" });
    }
 
    const token = data.token;
    
    // 2. Get ad account details (to find organization)
    const accountResponse = await axios.get(
      `https://api.linkedin.com/v2/adAccountsV2/${accountId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    console.log("🔎 adAccount response:", accountResponse.data);

    const organizationUrn =
      accountResponse.data.reference ||
      accountResponse.data.elements?.[0]?.reference;

    if (!organizationUrn) {
      return res.status(404).json({ error: "Organization URN not found in ad account" });
    }

    console.log("✅ Using organization URN:", organizationUrn);

    // 3. Fetch lead forms with organization URN
    const response = await axios.get(
      `https://api.linkedin.com/v2/leadForms?q=organization&organization=${organizationUrn}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    res.json({ ok: true, forms: response.data });
  } catch (err) {
    console.error("LinkedIn Lead Forms Error:", err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data || err.message });
  }
};