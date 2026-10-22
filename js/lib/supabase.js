// Creates the Supabase client using settings served by /api/config (from Vercel env vars).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export let supabase = null;
export let config = {};

export async function initSupabase() {
  config = await (await fetch('/api/config')).json();
  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    throw new Error('SUPABASE_URL / SUPABASE_ANON_KEY are missing in Vercel environment variables.');
  }
  supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);
  return supabase;
}
