import { useState, useEffect } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import QRScanner from '../../components/scanner/QRScanner';

export default function OrgVisitorPage() {
  const { orgSlug } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [org, setOrg] = useState(null);
  const [buildings, setBuildings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [currentLocation, setCurrentLocation] = useState(null);

  useEffect(() => {
    loadOrgData();
    checkUrlLocation();
  }, [orgSlug, searchParams]);

  async function checkUrlLocation() {
    const loc = searchParams.get('loc');
    if (loc) {
      try {
        const { data: node } = await supabase
          .from('nodes')
          .select('*, floors(name, building_id)')
          .eq('id', loc)
          .single();
        if (node) {
          setCurrentLocation(node);
        }
      } catch (err) {
        console.error("Error loading location from URL:", err);
      }
    }
  }

  async function loadOrgData() {
    try {
      // Fetch org by slug
      const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .select('*')
        .eq('slug', orgSlug)
        .single();

      if (orgError || !orgData) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setOrg(orgData);

      // Fetch buildings for this org
      const { data: buildingsData } = await supabase
        .from('buildings')
        .select('*')
        .eq('org_id', orgData.id)
        .order('name');

      setBuildings(buildingsData || []);
    } catch (err) {
      console.error('Error loading org data:', err);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div style={{
        minHeight: 'calc(100vh - 64px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div className="animate-pulse-slow" style={{ color: 'var(--color-text-secondary)' }}>
          Loading...
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div style={{
        minHeight: 'calc(100vh - 64px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}>
        <div className="glass-card animate-slide-up" style={{
          padding: '48px',
          textAlign: 'center',
          maxWidth: '450px',
        }}>
          <p style={{ fontSize: '3rem', marginBottom: '16px' }}>🔍</p>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '8px' }}>
            Organization Not Found
          </h2>
          <p style={{
            color: 'var(--color-text-secondary)',
            marginBottom: '24px',
          }}>
            The organization "{orgSlug}" doesn't exist or hasn't been set up yet.
          </p>
          <Link to="/" className="btn-primary" style={{ padding: '10px 24px' }}>
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  const orgTypeIcon = {
    college: '🎓',
    hospital: '🏥',
    mall: '🛍️',
    other: '🏢',
  };

  const handleScanSuccess = (decodedText) => {
    setShowScanner(false);
    try {
      // Decode the URL and extract loc param
      const url = new URL(decodedText);
      const loc = url.searchParams.get('loc');
      if (loc) {
        setSearchParams({ loc });
      } else {
        alert("Invalid IndoorNav QR code.");
      }
    } catch (e) {
      alert("Invalid QR format. Expected a URL.");
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      <div className="gradient-bg" />

      {showScanner && (
        <QRScanner 
          onScanSuccess={handleScanSuccess}
          onClose={() => setShowScanner(false)}
        />
      )}

      <div className="page-container animate-fade-in">
        {/* Org Header */}
        <div style={{
          textAlign: 'center',
          padding: '48px 0 32px',
        }}>
          <div style={{
            width: '72px',
            height: '72px',
            margin: '0 auto 16px',
            borderRadius: '18px',
            background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(139, 92, 246, 0.15))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '2rem',
          }}>
            {orgTypeIcon[org.type] || '🏢'}
          </div>
          <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '4px' }}>
            {org.name}
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', textTransform: 'capitalize' }}>
            {org.type} Navigation
          </p>
        </div>

        {/* Action Buttons */}
        <div style={{
          display: 'flex',
          gap: '12px',
          justifyContent: 'center',
          marginBottom: '48px',
          flexWrap: 'wrap',
        }}>
          <button 
            onClick={() => setShowScanner(true)}
            className="btn-primary" 
            style={{ padding: '14px 28px', fontSize: '1rem' }}
          >
            📷 Scan QR to Start
          </button>
          <button className="btn-secondary" style={{ padding: '14px 28px', fontSize: '1rem' }}>
            🔍 Search for a Room
          </button>
        </div>

        {/* Current Location Alert */}
        {currentLocation && (
          <div className="bg-green-500/20 border border-green-500/30 rounded-xl p-4 mb-8 text-center animate-slide-up">
            <span className="text-xl mr-2">📍</span>
            You are at <strong>Node {currentLocation.id.substring(0,8)}</strong> on <strong>{currentLocation.floors?.name}</strong>.
          </div>
        )}

        {/* Buildings */}
        {buildings.length === 0 ? (
          <div className="glass-card" style={{ padding: '48px', textAlign: 'center' }}>
            <p style={{ fontSize: '2.5rem', marginBottom: '16px' }}>🏗️</p>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '1.05rem' }}>
              Maps are being prepared for this organization.
              <br />Check back soon!
            </p>
          </div>
        ) : (
          <>
            <h2 style={{
              fontSize: '1.25rem',
              fontWeight: 600,
              marginBottom: '16px',
              textAlign: 'center',
            }}>
              Buildings
            </h2>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '16px',
              maxWidth: '800px',
              margin: '0 auto',
            }}>
              {buildings.map(building => (
                <div key={building.id} className="glass-card" style={{
                  padding: '24px',
                  textAlign: 'center',
                  cursor: 'pointer',
                }}>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '52px',
                    height: '52px',
                    borderRadius: '14px',
                    background: 'rgba(59, 130, 246, 0.1)',
                    fontSize: '1.5rem',
                    marginBottom: '12px',
                  }}>
                    🏢
                  </span>
                  <h3 style={{ fontWeight: 600, marginBottom: '4px' }}>{building.name}</h3>
                  <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>
                    Tap to navigate
                  </p>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Map Placeholder */}
        <div className="glass-card" style={{
          marginTop: '48px',
          padding: '64px 24px',
          textAlign: 'center',
          border: '2px dashed var(--color-border)',
          background: 'transparent',
        }}>
          <p style={{ fontSize: '2.5rem', marginBottom: '16px' }}>🗺️</p>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '8px' }}>
            Map View — Coming in Phase 3
          </h3>
          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
            Interactive Leaflet map with floor plans, route overlay, and live navigation
          </p>
        </div>
      </div>
    </div>
  );
}
