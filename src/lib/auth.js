import { supabase } from './supabase';

/**
 * Sign in with email and password via Supabase Auth.
 */
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data;
}

/**
 * Sign out the current user.
 */
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

/**
 * Get the current session (if any).
 */
export async function getSession() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw error;
  return session;
}

/**
 * Get the admin record for the currently logged-in user.
 * Returns { role, org_id, email, id } or null if not an admin.
 */
export async function getAdminProfile(authId) {
  const { data, error } = await supabase
    .from('admins')
    .select('id, org_id, email, role')
    .eq('auth_id', authId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // no row found
    throw error;
  }
  return data;
}
