import { Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

/**
 * ProtectedRoute — wraps routes that require authentication.
 *
 * @param {string} requiredRole - 'super_admin' | 'org_admin' | undefined (any authenticated user)
 * @param {ReactNode} children - the page component to render if authorized
 */
export default function ProtectedRoute({ requiredRole, children }) {
  const { isAuthenticated, profile, loading } = useAuth();

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        color: 'var(--color-text-secondary)',
        fontSize: '1rem',
      }}>
        <div className="animate-pulse-slow">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRole && profile?.role !== requiredRole) {
    // Redirect to appropriate dashboard based on actual role
    if (profile?.role === 'super_admin') {
      return <Navigate to="/super-admin" replace />;
    }
    if (profile?.role === 'org_admin') {
      return <Navigate to="/admin" replace />;
    }
    return <Navigate to="/login" replace />;
  }

  return children;
}
