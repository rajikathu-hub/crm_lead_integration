// controllers/whatsappController.js
import { getDb } from "../db.js";

 
// Save API key into api_connections
export const connectWhatsApp = async (req, res) => {
  try {
    const { user_id, api_key, phone_number_id } = req.body;
    if (!user_id || !api_key) {
      return res.status(400).json({ error: "user_id and api_key are required" });
    }

    const db = await getDb();

    const { error } = await db
      .from("intg_api_connections")
      .upsert(
        {
          user_id,
          platform_name: "whatsapp",
          api_key,
          status: "connected",
          phone_number_id,
        },
        { onConflict: "user_id,platform_name" } // unique constraint needed in your table
      );

    if (error) throw error;

    res.json({ message: "WhatsApp API key saved successfully" });
  } catch (error) {
    console.error("Error saving WhatsApp API key:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};
   
// Webhook from Stromx
export const whatsappWebhook = async (req, res) => {
  try {
    const payload = req.body;
    console.log("Incoming WhatsApp Lead:", JSON.stringify(payload, null, 2));

    const change = payload.entry?.[0]?.changes?.[0]?.value;
    const contact = change?.contacts?.[0];
    const message = change?.messages?.[0];

    const buyerName = contact?.profile?.name || null;
    const mobile = contact?.wa_id || null;
    const query = message?.text?.body || null;
    const msgTimestamp = message?.timestamp || null;
    const msgId = message?.id || null;
    const phoneNumberId = change?.metadata?.phone_number_id || null;

    let userId = null;

    const db = await getDb();
    const { error:insError } = await db.from("test_whatsapp_integration").insert([
      {
        raw_data: payload
      },
    ]);

    if (insError) {
      console.error("Error inserting test:", insError);
      return res.sendStatus(500);
    }



    // Lookup user_id from api_connections by phone_number_id
    if (phoneNumberId) {
      const { data: apiConn, error: apiErr } = await db
        .from("intg_api_connections")
        .select("user_id")
        .eq("platform_name", "whatsapp")
        .eq("phone_number_id", phoneNumberId)
        .limit(1)
        .maybeSingle();

      if (apiErr) {
        console.error("Error fetching api_connections:", apiErr);
      } else if (apiConn) {
        userId = apiConn.user_id;
      }
    }

    // Insert lead
    const { error: insertErr } = await db.from("intg_leads").insert([
      {
        user_id: userId,
        platform: "whatsapp",
        lead_data: payload, // Supabase will JSON encode automatically if column type = jsonb
        buyer_name: buyerName,
        mobile: mobile,
        query: query,
        created_at: msgTimestamp ? new Date(msgTimestamp * 1000).toISOString() : new Date().toISOString(),
        external_lead_id: msgId,
      },
    ]);

    if (insertErr) {
      console.error("Error inserting lead:", insertErr);
      return res.sendStatus(500);
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("Error saving WhatsApp lead:", error);
    res.sendStatus(500);
  }
};
   
// Fetch WhatsApp Leads for a specific user
export const getWhatsAppLeads = async (req, res) => {
  try {
    const { user_id } = req.params;
    if (!user_id) {
      return res.status(400).json({ error: "user_id is required" });
    }
     
    const db = await getDb();

    // Get leads
    const { data: leads, error: leadsErr } = await db
      .from("intg_leads")
      .select("id, buyer_name, mobile, query, created_at, lead_data")
      .eq("user_id", user_id)
      .eq("platform", "whatsapp")
      .order("created_at", { ascending: false });

    if (leadsErr) {
      console.error("Error fetching leads:", leadsErr);
      return res.status(500).json({ error: "Internal Server Error" });
    }

    // Check api_connections
    const { data: apiConn, error: apiErr } = await db
      .from("intg_api_connections")
      .select("*")
      .eq("user_id", user_id)
      .eq("platform_name", "whatsapp")
      .limit(1);

    if (apiErr) {
      console.error("Error fetching api_connections:", apiErr);
      return res.status(500).json({ error: "Internal Server Error" });
    }

    if (!apiConn || apiConn.length === 0) {
      return res.json({ error: "No API key for WhatsApp" });
    }

    res.json({ leads });
  } catch (error) {
    console.error("Error fetching WhatsApp leads:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};