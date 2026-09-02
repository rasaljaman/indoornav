import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

const FEATURES = [
  {
    icon: '📍',
    title: 'QR Navigation',
    description: 'Scan a QR code, get your position instantly. No GPS needed indoors.',
  },
  {
    icon: '📡',
    title: 'Offline-First',
    description: 'Works in basements, thick-walled corridors, and dead zones — no network required.',
  },
  {
    icon: '♿',
    title: 'Accessible Routes',
    description: 'Toggle between standard and wheelchair-friendly routes that avoid stairs.',
  },
  {
    icon: '🗺️',
    title: 'Live Tracking',
    description: 'Blue dot with heading cone moves as you walk — just like Google Maps.',
  },
  {
    icon: '🏢',
    title: 'Multi-Floor',
    description: 'Seamless routing across floors with stairs, lifts, and ramps.',
  },
  {
    icon: '⚡',
    title: 'Instant Setup',
    description: 'Admins draw maps or walk corridors to auto-generate the navigation graph.',
  },
];

export default function LandingPage() {
  const [organizations, setOrganizations] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingOrgs, setLoadingOrgs] = useState(true);

  useEffect(() => {
    loadOrganizations();
  }, []);

  async function loadOrganizations() {
    try {
      const { data, error } = await supabase
        .from('organizations')
        .select('id, name, type, slug')
        .order('name');

      if (error) throw error;
      setOrganizations(data || []);
    } catch (err) {
      console.warn('Could not load organizations:', err.message);
      setOrganizations([]);
    } finally {
      setLoadingOrgs(false);
    }
  }

  const filteredOrgs = organizations.filter(org =>
    org.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const orgTypeIcon = {
    college: '🎓',
    hospital: '🏥',
    mall: '🛍️',
    other: '🏢',
  };

  return (
    <div style={{ position: 'relative', overflow: 'hidden' }}>
      {/* Animated gradient background */}
      <div className="gradient-bg" />

      {/* Hero Section */}
      <section style={{
        minHeight: 'calc(100vh - 64px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '60px 24px',
      }}>
        <div className="animate-slide-up" style={{ marginBottom: '16px' }}>
          <span className="badge badge-blue">✨ No GPS Required</span>
        </div>

        <h1 className="animate-slide-up-delay-1" style={{
          fontSize: 'clamp(2.5rem, 6vw, 4.5rem)',
          fontWeight: 800,
          lineHeight: 1.1,
          maxWidth: '800px',
          marginBottom: '20px',
        }}>
          Navigate Any
          <span style={{
            background: 'linear-gradient(135deg, var(--color-accent-blue), var(--color-accent-purple), var(--color-accent-cyan))',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}> Indoor Space</span>
        </h1>

        <p className="animate-slide-up-delay-2" style={{
          fontSize: '1.15rem',
          color: 'var(--color-text-secondary)',
          maxWidth: '600px',
          lineHeight: 1.6,
          marginBottom: '36px',
        }}>
          Google Maps for buildings. Scan a QR code, search for any room,
          and follow a live moving dot to your destination — works offline.
        </p>

        <div className="animate-slide-up-delay-3" style={{
          display: 'flex',
          gap: '12px',
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}>
          <a href="#organizations" className="btn-primary" style={{ fontSize: '1rem', padding: '14px 32px' }}>
            Find Your Building
          </a>
          <a href="#features" className="btn-secondary" style={{ fontSize: '1rem', padding: '14px 32px' }}>
            How It Works
          </a>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" style={{
        padding: '80px 24px',
        maxWidth: '1200px',
        margin: '0 auto',
      }}>
        <h2 style={{
          textAlign: 'center',
          fontSize: '2rem',
          fontWeight: 700,
          marginBottom: '12px',
        }}>
          Built for Real Buildings
        </h2>
        <p style={{
          textAlign: 'center',
          color: 'var(--color-text-secondary)',
          marginBottom: '48px',
          maxWidth: '500px',
          margin: '0 auto 48px',
        }}>
          Every feature designed for the challenges of indoor navigation.
        </p>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: '20px',
        }}>
          {FEATURES.map((feature, i) => (
            <div
              key={i}
              className="glass-card"
              style={{ padding: '28px', cursor: 'default' }}
            >
              <div style={{
                fontSize: '2rem',
                marginBottom: '16px',
                width: '52px',
                height: '52px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '14px',
                background: 'rgba(59, 130, 246, 0.1)',
              }}>
                {feature.icon}
              </div>
              <h3 style={{
                fontSize: '1.1rem',
                fontWeight: 600,
                marginBottom: '8px',
              }}>
                {feature.title}
              </h3>
              <p style={{
                color: 'var(--color-text-secondary)',
                lineHeight: 1.6,
                fontSize: '0.9rem',
              }}>
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Organizations Directory */}
      <section id="organizations" style={{
        padding: '80px 24px',
        maxWidth: '1200px',
        margin: '0 auto',
      }}>
        <h2 style={{
          textAlign: 'center',
          fontSize: '2rem',
          fontWeight: 700,
          marginBottom: '12px',
        }}>
          Find Your Organization
        </h2>
        <p style={{
          textAlign: 'center',
          color: 'var(--color-text-secondary)',
          marginBottom: '32px',
        }}>
          Select your campus, hospital, or mall to start navigating.
        </p>

        {/* Search */}
        <div style={{
          maxWidth: '500px',
          margin: '0 auto 32px',
        }}>
          <input
            type="text"
            placeholder="Search organizations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-field"
            style={{ textAlign: 'center', fontSize: '1rem' }}
          />
        </div>

        {/* Org List */}
        {loadingOrgs ? (
          <p style={{
            textAlign: 'center',
            color: 'var(--color-text-muted)',
          }}>
            Loading organizations...
          </p>
        ) : filteredOrgs.length === 0 ? (
          <div className="glass-card" style={{
            padding: '48px',
            textAlign: 'center',
          }}>
            <p style={{ fontSize: '2.5rem', marginBottom: '16px' }}>🏗️</p>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '1.05rem' }}>
              {searchQuery
                ? 'No organizations match your search.'
                : 'No organizations yet. Admins can set up buildings to appear here.'}
            </p>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '16px',
          }}>
            {filteredOrgs.map(org => (
              <Link
                key={org.id}
                to={`/${org.slug}`}
                className="glass-card"
                style={{
                  padding: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  textDecoration: 'none',
                }}
              >
                <span style={{
                  fontSize: '2rem',
                  width: '48px',
                  height: '48px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '12px',
                  background: 'rgba(59, 130, 246, 0.1)',
                  flexShrink: 0,
                }}>
                  {orgTypeIcon[org.type] || '🏢'}
                </span>
                <div>
                  <h3 style={{ fontWeight: 600, fontSize: '1.05rem' }}>{org.name}</h3>
                  <p style={{
                    color: 'var(--color-text-muted)',
                    fontSize: '0.8rem',
                    textTransform: 'capitalize',
                  }}>
                    {org.type}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Footer */}
      <footer style={{
        borderTop: '1px solid var(--color-border)',
        padding: '32px 24px',
        textAlign: 'center',
        color: 'var(--color-text-muted)',
        fontSize: '0.85rem',
      }}>
        <p>IndoorNav — Google Maps for Indoor Spaces</p>
      </footer>
    </div>
  );
}
