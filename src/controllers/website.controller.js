import { getDb } from "../db.js";
import { v4 as uuidv4 } from "uuid";

const db = await getDb();

/**
 * Save Website API key for a user
 */

export const connectWebsite = async (req, res) => {
  try {
    
    const { user_id, api_key } = req.body;

    if (!user_id || !api_key) {
      return res.status(400).json({ error: "user_id and api_key are required" });
    }
 
    const db = await getDb();

    // Insert or update API key in api_connections
    const { error } = await db
      .from("intg_api_connections")
      .upsert(
        {
          user_id,
          platform_name: "website",
          api_key,
          status: "connected",
          pending_api_key:null
        },
        {
          onConflict: "user_id, platform_name", // must match a unique constraint/index in DB
        }
      );

    if (error) {
      console.error("❌ Supabase error:", error);
      return res.status(500).json({ error: "Failed to connect IndiaMART" });
    }

    return res.json({ message: "Website connected successfully" });
  } catch (err) {
    console.error("❌ Error connecting IndiaMART:", err);
    return res.status(500).json({ error: "Server error" });
  }
};


/**
 * Fetch Website leads and save them in DB
 */
export const leadsReceiver = async (req, res) => {
  try {
    const apiKey = req.headers["x-api-key"];
    const lead = req.body;

    if (!apiKey) return res.status(401).json({ error: "API key required" });

    // ✅ Allowed fields
    const allowedFields = ["company", "name", "phone", "email", "product","product_price","source"];

    // ✅ Validate fields
    const leadKeys = Object.keys(lead || {});
    const invalidFields = leadKeys.filter(
      (key) => !allowedFields.includes(key.toLowerCase())
    );

    if (invalidFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Invalid field(s) found: ${invalidFields.join(
          ", "
        )}. Allowed fields are: ${allowedFields.join(", ")}`,
      });
    }

    const db = await getDb();

    // ✅ Validate API Key
    const { data: apiConn } = await db
      .from("intg_api_connections")
      .select("user_id")
      .eq("platform_name", "website")
      .eq("api_key", apiKey)
      .limit(1)
      .maybeSingle();

    if (!apiConn)
      return res.status(401).json({ error: "Invalid API key" });

    const userId = apiConn.user_id;
    const externalLeadId = uuidv4(); // 🔥 Generate unique UUID

    // ✅ Save valid lead into Supabase
    const { error } = await db.from("intg_leads").insert({
      user_id: userId,
      platform: "website",
      external_lead_id: externalLeadId,
      lead_data: lead,
      created_at: new Date().toISOString(),
    });

    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({
      success: true,
      message: "Lead received successfully",
    });
  } catch (error) {
    console.error("❌ Error receiving Website lead:", error);
    return res
      .status(500)
      .json({ error: "Failed to receive Website lead" });
  }
};

// Fetch Website Leads for a specific user
export const getWebsiteLeads = async (req, res) => {
  try {
    
    const { user_id } = req.params;
    if (!user_id) {
      return res.status(400).json({ error: "user_id is required" });
    }
     
    const db = await getDb();
    
    // Get leads
    const { data: leads, error: leadsErr } = await db
      .from("intg_leads")
      .select("id, created_at, lead_data")
      .eq("user_id", user_id)
      .eq("platform", "website")
      .order("created_at", { ascending: false });

      console.log("Leads fetched:", leads.length);

    if (leadsErr) {
      console.error("Error fetching leads:", leadsErr);
      return res.status(500).json({ error: "Internal Server Error" });
    }

    // Check api_connections
    const { data: apiConn, error: apiErr } = await db
      .from("intg_api_connections")
      .select("*")
      .eq("user_id", user_id)
      .eq("platform_name", "website")
      .limit(1);

    if (apiErr) {
      console.error("Error fetching api_connections:", apiErr);
      return res.status(500).json({ error: "Internal Server Error" });
    }

    if (!apiConn || apiConn.length === 0) {
      return res.json({ error: "No API key for Website" });
    }
 
    res.json({ leads });
  } catch (error) {
    console.error("Error fetching Website leads:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};