import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

export default function Navbar() {
  const { isAuthenticated, isSuperAdmin, isOrgAdmin, signOut, loading } = useAuth();
  const navigate = useNavigate();

  async function handleSignOut() {
    try {
      await signOut();
      navigate('/');
    } catch (err) {
      console.error('Sign out error:', err);
    }
  }

  return (
    <nav style={{
      position: 'sticky',
      top: 0,
      zIndex: 50,
      background: 'rgba(10, 10, 15, 0.85)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      borderBottom: '1px solid var(--color-border)',
    }}>
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: '64px',
      }}>
        {/* Logo */}
        <Link to="/" style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontWeight: 700,
          fontSize: '1.25rem',
        }}>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, var(--color-accent-blue), var(--color-accent-purple))',
            fontSize: '1.1rem',
          }}>
            🧭
          </span>
          <span>IndoorNav</span>
        </Link>

        {/* Nav Links */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          {!loading && (
            <>
              {isAuthenticated ? (
                <>
                  {isSuperAdmin && (
                    <Link to="/super-admin" className="btn-secondary" style={{
                      padding: '8px 16px',
                      fontSize: '0.85rem',
                    }}>
                      Super Admin
                    </Link>
                  )}
                  {isOrgAdmin && (
                    <Link to="/admin" className="btn-secondary" style={{
                      padding: '8px 16px',
                      fontSize: '0.85rem',
                    }}>
                      Dashboard
                    </Link>
                  )}
                  <button
                    onClick={handleSignOut}
                    className="btn-secondary"
                    style={{
                      padding: '8px 16px',
                      fontSize: '0.85rem',
                    }}
                  >
                    Sign Out
                  </button>
                </>
              ) : (
                <Link to="/login" className="btn-primary" style={{
                  padding: '8px 20px',
                  fontSize: '0.85rem',
                }}>
                  Admin Login
                </Link>
              )}
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
