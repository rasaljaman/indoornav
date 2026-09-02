import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';

export default function AdminDashboard() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [org, setOrg] = useState(null);
  const [buildings, setBuildings] = useState([]);
  const [stats, setStats] = useState({ buildings: 0, floors: 0, rooms: 0, qrPoints: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile?.org_id) {
      loadDashboardData();
    }
  }, [profile]);

  async function loadDashboardData() {
    try {
      // Load org details
      const { data: orgData } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', profile.org_id)
        .single();
      setOrg(orgData);

      // Load buildings
      const { data: buildingsData } = await supabase
        .from('buildings')
        .select('*')
        .eq('org_id', profile.org_id)
        .order('name');
      setBuildings(buildingsData || []);

      // Count stats
      const buildingIds = (buildingsData || []).map(b => b.id);

      let floorCount = 0;
      let roomCount = 0;
      let qrCount = 0;

      if (buildingIds.length > 0) {
        const { count: fc } = await supabase
          .from('floors')
          .select('*', { count: 'exact', head: true })
          .in('building_id', buildingIds);
        floorCount = fc || 0;

        // Get floor IDs for rooms and QR counts
        const { data: floorsData } = await supabase
          .from('floors')
          .select('id')
          .in('building_id', buildingIds);
        const floorIds = (floorsData || []).map(f => f.id);

        if (floorIds.length > 0) {
          const { count: rc } = await supabase
            .from('rooms')
            .select('*', { count: 'exact', head: true })
            .in('floor_id', floorIds);
          roomCount = rc || 0;

          const { data: nodesData } = await supabase
            .from('nodes')
            .select('id')
            .in('floor_id', floorIds);
          const nodeIds = (nodesData || []).map(n => n.id);

          if (nodeIds.length > 0) {
            const { count: qc } = await supabase
              .from('qr_points')
              .select('*', { count: 'exact', head: true })
              .in('node_id', nodeIds);
            qrCount = qc || 0;
          }
        }
      }

      setStats({
        buildings: buildingsData?.length || 0,
        floors: floorCount,
        rooms: roomCount,
        qrPoints: qrCount,
      });
    } catch (err) {
      console.error('Error loading dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="page-container" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 'calc(100vh - 64px)',
      }}>
        <div className="animate-pulse-slow" style={{ color: 'var(--color-text-secondary)' }}>
          Loading dashboard...
        </div>
      </div>
    );
  }

  return (
    <div className="page-container animate-fade-in">
      {/* Welcome Banner */}
      <div className="glass-card" style={{
        padding: '32px',
        marginBottom: '24px',
        background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.08), rgba(139, 92, 246, 0.08))',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '4px' }}>
              Welcome back 👋
            </h1>
            <p style={{ color: 'var(--color-text-secondary)' }}>
              {org?.name || 'Your Organization'} — {org?.type || 'organization'}
            </p>
          </div>
          <span className="badge badge-green">Org Admin</span>
        </div>
      </div>

      {/* Stats Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
        marginBottom: '32px',
      }}>
        {[
          { label: 'Buildings', value: stats.buildings, icon: '🏢' },
          { label: 'Floors', value: stats.floors, icon: '🏗️' },
          { label: 'Rooms', value: stats.rooms, icon: '🚪' },
          { label: 'QR Points', value: stats.qrPoints, icon: '📍' },
        ].map((stat) => (
          <div key={stat.label} className="glass-card stat-card">
            <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>{stat.icon}</div>
            <div className="stat-value">{stat.value}</div>
            <div className="stat-label">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Buildings List */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px',
        }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Buildings</h2>
          <button className="btn-primary" style={{ padding: '8px 20px', fontSize: '0.85rem' }}>
            + Add Building
          </button>
        </div>

        {buildings.length === 0 ? (
          <div className="glass-card" style={{ padding: '48px', textAlign: 'center' }}>
            <p style={{ fontSize: '2.5rem', marginBottom: '16px' }}>🏗️</p>
            <p style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }}>
              No buildings yet. Add your first building to start drawing maps.
            </p>
            <button className="btn-primary" style={{ padding: '10px 24px', fontSize: '0.9rem' }}>
              + Create First Building
            </button>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '16px',
          }}>
            {buildings.map(building => (
              <div key={building.id} className="glass-card" style={{ padding: '24px' }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  marginBottom: '16px',
                }}>
                  <span style={{
                    fontSize: '1.5rem',
                    width: '44px',
                    height: '44px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '12px',
                    background: 'rgba(59, 130, 246, 0.1)',
                  }}>
                    🏢
                  </span>
                  <div>
                    <h3 style={{ fontWeight: 600 }}>{building.name}</h3>
                    <p style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>
                      Created {new Date(building.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <button 
                  onClick={async () => {
                    // Try to get the first floor for this building
                    let { data: floors } = await supabase
                      .from('floors')
                      .select('id')
                      .eq('building_id', building.id)
                      .limit(1);
                    
                    let floorId;
                    if (!floors || floors.length === 0) {
                      // Create a default Ground Floor
                      const { data: newFloor, error } = await supabase
                        .from('floors')
                        .insert([{ building_id: building.id, name: 'Ground Floor', level: 0 }])
                        .select('id')
                        .single();
                      if (error) {
                        alert('Failed to create floor: ' + error.message);
                        return;
                      }
                      floorId = newFloor.id;
                    } else {
                      floorId = floors[0].id;
                    }
                    // Navigate to the editor
                    navigate(`/admin/buildings/${building.id}/floors/${floorId}/editor`);
                  }}
                  className="btn-secondary" 
                  style={{
                    width: '100%',
                    padding: '10px',
                    fontSize: '0.85rem',
                  }}
                >
                  Open Map Editor →
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
