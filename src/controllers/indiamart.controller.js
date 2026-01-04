import { getDb } from "../db.js";
import axios from "axios";

const db = await getDb();

/**
 * Save IndiaMART API key for a user
 */

export const connectIndiaMart = async (req, res) => {
  try {
    
    const { user_id, api_key } = req.body;

    if (!user_id || !api_key) {
      return res.status(400).json({ error: "user_id and api_key are required" });
    }
 
    // Insert or update API key in api_connections
    const { error } = await db
      .from("intg_api_connections")
      .upsert(
        {
          user_id,
          platform_name: "indiamart",
          api_key,
          status: "connected",
        },
        {
          onConflict: "user_id, platform_name", // must match a unique constraint/index in DB
        }
      );

    if (error) {
      console.error("❌ Supabase error:", error);
      return res.status(500).json({ error: "Failed to connect IndiaMART" });
    }

    return res.json({ message: "IndiaMART connected successfully" });
  } catch (err) {
    console.error("❌ Error connecting IndiaMART:", err);
    return res.status(500).json({ error: "Server error" });
  }
};


/**
 * Fetch IndiaMART leads and save them in DB
 */
export const  fetchIndiaMartLeads = async (req, res) => {
  try {
    const { userId, start_time, end_time } = req.query;
    
    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    const db = await getDb();

    // 1. Get API key from Supabase
    const { data: apiConn, error: apiError } = await db
      .from("intg_api_connections")
      .select("api_key")
      .eq("user_id", userId)
      .eq("platform_name", "indiamart")
      .eq("status", "connected")
      .single();
 
    if (apiError || !apiConn) {
      return res.status(404).json({ error: "No IndiaMART API key found" });
    }
 
    const apiKey = apiConn.api_key;
 
    // 2. Build IndiaMART API URL
    let url = `https://mapi.indiamart.com/wservce/crm/crmListing/v2/?glusr_crm_key=${encodeURIComponent(apiKey)}`;
    if (start_time && end_time) {
      url += `&start_time=${encodeURIComponent(start_time)}&end_time=${encodeURIComponent(end_time)}`;
    }

    console.log("Fetching IndiaMART leads from URL:", url);
    
    // 3. Call IndiaMART API
    const response = await axios.get(url, {
      headers: { Accept: "application/json" },
    });

    const leads = response.data.RESPONSE || [];

    console.log(`Fetched ${leads.length} leads from IndiaMART`);

    // 4. Save leads into Supabase
    for (let lead of leads) {
      if (!lead.UNIQUE_QUERY_ID) continue; // skip if no unique ID

      const db = await getDb();

      const { error: insertError } = await db
        .from("intg_leads")
        .upsert(
          {
            user_id:userId,
            platform: "indiamart",
            external_lead_id: lead.UNIQUE_QUERY_ID, // unique lead ID
            lead_data: lead,                        // Supabase will store JSON
            created_at: new Date().toISOString(),
          },
          { onConflict: "platform,external_lead_id" } // must match your DB unique constraint
        );

      if (insertError) {
        console.error("❌ Error saving lead:", insertError);
      }
    }

    return res.json({
      message: "Leads fetched & saved successfully",
      total_records: leads.length,
      leads,
    });
  } catch (error) {
    console.error("❌ Error fetching IndiaMART leads:", error?.response?.data || error.message);
    return res.status(500).json({ error: "Failed to fetch IndiaMART leads" });
  }
};
