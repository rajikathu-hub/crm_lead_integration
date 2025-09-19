// src/db.js
import { createClient } from "@supabase/supabase-js";

let supabase;

export async function getDb() {
  if (!supabase) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY; // or SERVICE_ROLE_KEY for server-side
    
    supabase = createClient(supabaseUrl, supabaseKey);
  }
  return supabase;
}
