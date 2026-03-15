import { createClient } from '@supabase/supabase-js';

/**
 * Extract and verify Bearer token from request.
 * Returns { user, supabaseClient } or null if unauthenticated.
 */
export async function authenticateRequest(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.replace('Bearer ', '');

  // Create a Supabase client with the user's JWT to verify it
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: { user }, error } = await userClient.auth.getUser(token);

  if (error || !user) {
    return null;
  }

  return { user, token };
}

/**
 * Require authentication. Sends 401 response if not authenticated.
 * Returns { user, token } or null (response already sent).
 */
export async function requireAuth(req, res) {
  const auth = await authenticateRequest(req);
  if (!auth) {
    res.status(401).json({ error: '認証が必要です' });
    return null;
  }
  return auth;
}
