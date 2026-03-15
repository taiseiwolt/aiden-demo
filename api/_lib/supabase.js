import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
}

// Service role client — full admin access (used by API endpoints)
export const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

// Anon client factory — for user-level auth operations
export function createAnonClient() {
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!anonKey) {
    throw new Error('Missing SUPABASE_ANON_KEY environment variable');
  }
  return createClient(supabaseUrl, anonKey);
}
