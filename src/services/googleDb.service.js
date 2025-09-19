import { getDb } from "../db.js";

/**
 * Save (or update) the Google Ads token for a user
 * - Stores access_token, refresh_token, and expiry
 * - Keeps platform_name = 'google'
 */
export async function upsertGoogleConnection(
  userId,
  { access_token, refresh_token, expires_in }
) {
  const db = await getDb();
  const expiresAt = new Date(Date.now() + (expires_in || 3600) * 1000).toISOString();

  const { error } = await db
    .from("intg_api_connections")
    .upsert(
      {
        user_id: userId,
        platform_name: "google",
        token: access_token || null,
        refresh_token: refresh_token || null,
        status: "connected",
        token_expires_at: expiresAt,
      },
      { onConflict: "user_id,platform_name" } // <- composite unique constraint
    );

  if (error) throw error;
}

/** Save selected Google customer ID (stored in ad_account_id) */
export async function saveGoogleSelectedCustomer(userId, customerId) {

  
  const db = await getDb();
  const { error } = await db
    .from("intg_api_connections")
    .upsert(
      {
        user_id: userId,
        platform_name: "google",
        ad_account_id: String(customerId),
        status: "connected",
      },
      { onConflict: "user_id,platform_name" }
    );
 
  if (error) throw error;
}

/** Get connection status */
export async function getGoogleConnectionStatus(userId) {
  const db = await getDb();
  const { data, error } = await db
    .from("intg_api_connections")
    .select("token_expires_at, ad_account_id, refresh_token")
    .eq("user_id", userId)
    .eq("platform_name", "google")
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return { connected: false, reason: "no_row" };

  const expiresAt = data.token_expires_at ? new Date(data.token_expires_at) : null;
  const secsLeft = expiresAt
    ? Math.floor((expiresAt.getTime() - Date.now()) / 1000)
    : 0;

  return {
    connected: true,
    selectedCustomerId: data.ad_account_id ? String(data.ad_account_id) : null,
    hasRefreshToken: !!data.refresh_token,
    tokenExpiresAt: expiresAt ? expiresAt.toISOString() : null,
    secondsToExpiry: secsLeft,
  };
}

export function tokenIsFresh(row) {
  if (!row?.token_expires_at) return false;
  // treat as fresh if > 60s remaining
  return new Date(row.token_expires_at).getTime() - Date.now() > 60_000;
}

/** Get raw connection row */
export async function getGoogleConnection(userId) {
  const db = await getDb();
  const { data, error } = await db
    .from("intg_api_connections")
    .select("user_id, platform_name, token, refresh_token, token_expires_at, ad_account_id")
    .eq("user_id", userId)
    .eq("platform_name", "google")
    .limit(1)
    .maybeSingle();

    console.log("sf",data);

  if (error) throw error;

  

  return data || null;
}

/** Get simplified summary */
export async function getGoogleSummary(userId) {
  const row = await getGoogleConnection(userId);
  if (!row) return null;

  const expiresAt = row.token_expires_at ? new Date(row.token_expires_at) : null;
  const secondsToExpiry = expiresAt
    ? Math.floor((expiresAt.getTime() - Date.now()) / 1000)
    : null;

  return {
    connected: !!row.token || !!row.refresh_token,
    selectedCustomerId: row.ad_account_id ? String(row.ad_account_id) : null,
    hasRefreshToken: !!row.refresh_token,
    tokenExpiresAt: expiresAt ? expiresAt.toISOString() : null,
    secondsToExpiry,
  };
}
