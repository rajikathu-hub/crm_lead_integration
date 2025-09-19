// src/services/googleAds.service.js
import { OAuth2Client } from "google-auth-library";
import axios from "axios";
import { mem } from "../store/memory.js";
import { upsertGoogleConnection, saveGoogleSelectedCustomer, tokenIsFresh, getGoogleConnection } from "./googleDb.service.js";


const ADS_API_BASE = "https://googleads.googleapis.com";
const ADS_API_VERSION = "v21"; // keep consistent across calls

// OAuth client for the Google Ads connect flow
const oauthAds = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_ADS_REDIRECT_URI // e.g. http://localhost:3000/ads/google/callback
);

export function getGoogleAdsAuthUrl() {
  return oauthAds.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/adwords"],
  });
}



export async function exchangeAdsCode(code, userId = 1) {
  
  console.log("Before Tokens received");
  console.log("toekn",process.env.GOOGLE_ADS_REDIRECT_URI)
  const { tokens } = await oauthAds.getToken(code);

  // keep your current in-memory lines
  const now = Math.floor(Date.now() / 1000);
  mem.googleAds.access_token = tokens.access_token || null;
  console.log("Refresh Token:",tokens.refresh_token);
  if (tokens.refresh_token) mem.googleAds.refresh_token = tokens.refresh_token;
  mem.googleAds.access_token_expiry = now + (tokens.expires_in || 3600);

  // NEW: persist to DB
  await upsertGoogleConnection(userId, {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token, // may be undefined on repeat consent
    expires_in: tokens.expires_in || 3600
  });

  return tokens;
}

async function getFreshAccessToken(userId = 1) {
  const now = Math.floor(Date.now() / 1000);
 
 
  // 1) If memory has a valid token, use it
  if (mem.googleAds.access_token && now < mem.googleAds.access_token_expiry - 60) {
    return mem.googleAds.access_token;
  }
  else
  {
    // 2) Try DB fallback
    const row = await getGoogleConnection(userId);
    if (row) {
      // load selected customer into memory if present
      if (row.ad_account_id && !mem.googleAds.selectedCustomerId) {
        mem.googleAds.selectedCustomerId = String(row.ad_account_id);
      }
      
      // if DB token is still fresh, use it
      //@Need to Uncoment and below if to be remove
      if (tokenIsFresh(row) && row.token) {
        mem.googleAds.access_token = row.token;
        // recompute approximate expiry in seconds
        const expSec = Math.floor((new Date(row.token_expires_at).getTime() - Date.now()) / 1000);
        mem.googleAds.access_token_expiry = now + Math.max(expSec, 0);
        return mem.googleAds.access_token;
      }
     
      // 3) Refresh using refresh_token if we have one
      if (row.refresh_token) {
        const url = "https://oauth2.googleapis.com/token";
        const params = new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
          grant_type: "refresh_token",
          refresh_token: row.refresh_token,
        });
        const { data } = await axios.post(url, params);
        mem.googleAds.access_token = data.access_token;
        mem.googleAds.access_token_expiry = now + (data.expires_in || 3600);
        // also persist refreshed access token + expiry
        await upsertGoogleConnection(userId, {
          access_token: data.access_token,
          refresh_token: row.refresh_token,
          expires_in: data.expires_in || 3600,
        });
        return mem.googleAds.access_token;
      }
       
    }
  }
  throw new Error("No valid Google Ads token available. Reconnect via /ads/google/connect.");
}

function baseHeaders(token) {
  if (!process.env.GOOGLE_ADS_DEVELOPER_TOKEN) {
    throw new Error("Missing GOOGLE_ADS_DEVELOPER_TOKEN in .env");
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN,
  };

  // Only set if you really use an MCC (numbers only, no dashes)
  if (process.env.LOGIN_CUSTOMER_ID && String(process.env.LOGIN_CUSTOMER_ID).trim() !== "") {
    headers["login-customer-id"] = String(process.env.LOGIN_CUSTOMER_ID).replace(/-/g, "");
  }

  return headers;
}

export async function listAccessibleCustomers(userId = 1) {
  const token = await getFreshAccessToken(userId);
  const url = `${ADS_API_BASE}/${ADS_API_VERSION}/customers:listAccessibleCustomers`;
  const { data } = await axios.get(url, { headers: baseHeaders(token) });
  return data.resourceNames || [];
}

export async function setSelectedCustomerId(resourceName, userId = 1) {
  if (!resourceName?.startsWith("customers/")) {
    throw new Error("Invalid customer resource name. Expected format: 'customers/1234567890'.");
  }
  const id = resourceName.split("/")[1];
  console.log("selected Customer:",id);
  // keep in memory for current process
  mem.googleAds.selectedCustomerId = id;

  // NEW: persist to DB
  await saveGoogleSelectedCustomer(userId, id);

  return id;
}

export async function searchStreamGAQL(gaql, userId = 1) {
  const token = await getFreshAccessToken(userId);
  const cid = mem.googleAds.selectedCustomerId;
  if (!cid) throw new Error("No customerId selected. POST to /ads/google/select-customer first.");

  console.log("GSql",gaql);
  const url = `${ADS_API_BASE}/${ADS_API_VERSION}/customers/${cid}/googleAds:searchStream`;
  const { data } = await axios.post(
    url,
    { query: gaql },
    { headers: { ...baseHeaders(token), "Content-Type": "application/json" } }
  );
 
  console.log(JSON.stringify(res.data, null, 2));

  // flatten results from all chunks
  const rows = [];
  for (const chunk of data) if (chunk.results) rows.push(...chunk.results);
  return rows;
}



