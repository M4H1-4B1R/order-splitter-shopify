import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  // It's fine to let instantiation fail in dev if env missing, but log for clarity
  console.warn(
    "SUPABASE_URL or SUPABASE_KEY not set. Supabase client may fail."
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
