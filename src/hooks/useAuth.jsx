import { useState, useEffect, useContext, createContext } from 'react';
import { supabase } from '../lib/supabase';
import { getAdminProfile } from '../lib/auth';

const AuthContext = createContext(null);

/**
 * AuthProvider wraps the app and provides auth state to all children.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null); // { id, role, org_id, email }
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setUser(session?.user ?? null);
        if (session?.user) {
          await loadProfile(session.user.id);
        } else {
          setProfile(null);
          setLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  async function loadProfile(authId) {
    try {
      const adminProfile = await getAdminProfile(authId);
      setProfile(adminProfile);
    } catch (err) {
      console.error('Error loading admin profile:', err);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    return data;
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }

  const value = {
    user,
    profile,
    loading,
    signIn,
    signOut,
    isAuthenticated: !!user,
    isSuperAdmin: profile?.role === 'super_admin',
    isOrgAdmin: profile?.role === 'org_admin',
    orgId: profile?.org_id,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Hook to access auth state and actions.
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
