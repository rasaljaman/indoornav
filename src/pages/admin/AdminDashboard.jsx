import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';

export default function AdminDashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [org, setOrg] = useState(null);
  const [buildings, setBuildings] = useState([]);
  const [floorsMap, setFloorsMap] = useState({}); // { buildingId: [floors] }
  const [stats, setStats] = useState({ buildings: 0, floors: 0, rooms: 0, qrPoints: 0 });
  const [loading, setLoading] = useState(true);

  // Building CRUD state
  const [showCreateBuilding, setShowCreateBuilding] = useState(false);
  const [newBuildingName, setNewBuildingName] = useState('');
  const [creatingBuilding, setCreatingBuilding] = useState(false);

  // Floor CRUD state
  const [addingFloorFor, setAddingFloorFor] = useState(null); // buildingId
  const [newFloorName, setNewFloorName] = useState('');
  const [newFloorLevel, setNewFloorLevel] = useState(0);
  const [creatingFloor, setCreatingFloor] = useState(false);

  // Expanded buildings
  const [expandedBuildings, setExpandedBuildings] = useState(new Set());

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

      // Load all floors for these buildings
      const buildingIds = (buildingsData || []).map(b => b.id);
      let allFloors = [];
      if (buildingIds.length > 0) {
        const { data: floorsData } = await supabase
          .from('floors')
          .select('*')
          .in('building_id', buildingIds)
          .order('level');
        allFloors = floorsData || [];
      }

      // Group floors by building
      const fMap = {};
      for (const f of allFloors) {
        if (!fMap[f.building_id]) fMap[f.building_id] = [];
        fMap[f.building_id].push(f);
      }
      setFloorsMap(fMap);

      // Count stats
      let roomCount = 0;
      let qrCount = 0;
      const floorIds = allFloors.map(f => f.id);

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

      setStats({
        buildings: buildingsData?.length || 0,
        floors: allFloors.length,
        rooms: roomCount,
        qrPoints: qrCount,
      });
    } catch (err) {
      console.error('Error loading dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateBuilding(e) {
    e.preventDefault();
    if (!newBuildingName.trim()) return;
    setCreatingBuilding(true);
    try {
      const { error } = await supabase
        .from('buildings')
        .insert({ name: newBuildingName.trim(), org_id: profile.org_id });
      if (error) throw error;
      setNewBuildingName('');
      setShowCreateBuilding(false);
      await loadDashboardData();
    } catch (err) {
      alert('Failed to create building: ' + err.message);
    } finally {
      setCreatingBuilding(false);
    }
  }

  async function handleDeleteBuilding(buildingId, buildingName) {
    if (!window.confirm(`Delete "${buildingName}" and ALL its floors, rooms, and map data? This cannot be undone.`)) return;
    try {
      const { error } = await supabase
        .from('buildings')
        .delete()
        .eq('id', buildingId);
      if (error) throw error;
      await loadDashboardData();
    } catch (err) {
      alert('Failed to delete building: ' + err.message);
    }
  }

  async function handleCreateFloor(e, buildingId) {
    e.preventDefault();
    if (!newFloorName.trim()) return;
    setCreatingFloor(true);
    try {
      const { error } = await supabase
        .from('floors')
        .insert({ building_id: buildingId, name: newFloorName.trim(), level: newFloorLevel });
      if (error) throw error;
      setNewFloorName('');
      setNewFloorLevel(0);
      setAddingFloorFor(null);
      await loadDashboardData();
    } catch (err) {
      alert('Failed to create floor: ' + err.message);
    } finally {
      setCreatingFloor(false);
    }
  }

  async function handleDeleteFloor(floorId, floorName) {
    if (!window.confirm(`Delete floor "${floorName}" and all its rooms/nodes? This cannot be undone.`)) return;
    try {
      const { error } = await supabase
        .from('floors')
        .delete()
        .eq('id', floorId);
      if (error) throw error;
      await loadDashboardData();
    } catch (err) {
      alert('Failed to delete floor: ' + err.message);
    }
  }

  function toggleBuilding(buildingId) {
    setExpandedBuildings(prev => {
      const next = new Set(prev);
      if (next.has(buildingId)) next.delete(buildingId);
      else next.add(buildingId);
      return next;
    });
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

      {/* Buildings Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '16px',
      }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Buildings</h2>
        <button
          className="btn-primary"
          style={{ padding: '8px 20px', fontSize: '0.85rem' }}
          onClick={() => setShowCreateBuilding(!showCreateBuilding)}
        >
          {showCreateBuilding ? 'Cancel' : '+ Add Building'}
        </button>
      </div>

      {/* Create Building Form */}
      {showCreateBuilding && (
        <div className="glass-card animate-slide-up" style={{ padding: '24px', marginBottom: '20px' }}>
          <h3 style={{ fontWeight: 600, marginBottom: '16px' }}>New Building</h3>
          <form onSubmit={handleCreateBuilding} style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label className="input-label">Building Name</label>
              <input
                type="text"
                className="input-field"
                placeholder="e.g. Main Block, Library, Admin Block"
                value={newBuildingName}
                onChange={(e) => setNewBuildingName(e.target.value)}
                required
                autoFocus
              />
            </div>
            <button
              type="submit"
              className="btn-primary"
              disabled={creatingBuilding}
              style={{ padding: '12px 24px', whiteSpace: 'nowrap' }}
            >
              {creatingBuilding ? 'Creating...' : 'Create'}
            </button>
          </form>
        </div>
      )}

      {/* Buildings List */}
      {buildings.length === 0 ? (
        <div className="glass-card" style={{ padding: '48px', textAlign: 'center' }}>
          <p style={{ fontSize: '2.5rem', marginBottom: '16px' }}>🏗️</p>
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: '16px' }}>
            No buildings yet. Add your first building to start drawing maps.
          </p>
          <button
            className="btn-primary"
            style={{ padding: '10px 24px', fontSize: '0.9rem' }}
            onClick={() => setShowCreateBuilding(true)}
          >
            + Create First Building
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {buildings.map(building => {
            const floors = floorsMap[building.id] || [];
            const isExpanded = expandedBuildings.has(building.id);

            return (
              <div key={building.id} className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                {/* Building Header */}
                <div
                  style={{
                    padding: '20px 24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                  }}
                  onClick={() => toggleBuilding(building.id)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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
                        {floors.length} floor{floors.length !== 1 ? 's' : ''} · Created {new Date(building.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteBuilding(building.id, building.name); }}
                      className="btn-secondary"
                      style={{ padding: '6px 14px', fontSize: '0.75rem', color: 'var(--color-error)' }}
                    >
                      Delete
                    </button>
                    <span style={{
                      transition: 'transform 0.2s',
                      transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                      fontSize: '0.8rem',
                      color: 'var(--color-text-muted)',
                    }}>
                      ▼
                    </span>
                  </div>
                </div>

                {/* Expanded: Floors */}
                {isExpanded && (
                  <div style={{
                    borderTop: '1px solid var(--color-border)',
                    padding: '16px 24px',
                    background: 'rgba(0,0,0,0.15)',
                  }}>
                    {/* Floors List */}
                    {floors.length === 0 ? (
                      <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '12px' }}>
                        No floors yet. Add a floor to start mapping.
                      </p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                        {floors.map(floor => (
                          <div
                            key={floor.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '10px 16px',
                              borderRadius: '10px',
                              background: 'rgba(255,255,255,0.03)',
                              border: '1px solid var(--color-border)',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <span style={{
                                width: '32px',
                                height: '32px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                borderRadius: '8px',
                                background: 'rgba(59, 130, 246, 0.1)',
                                fontSize: '0.8rem',
                                fontWeight: 700,
                                color: 'var(--color-accent-blue)',
                              }}>
                                L{floor.level}
                              </span>
                              <div>
                                <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>{floor.name}</span>
                                {floor.real_width_m && (
                                  <span style={{
                                    marginLeft: '8px',
                                    fontSize: '0.7rem',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    background: 'rgba(16, 185, 129, 0.15)',
                                    color: 'var(--color-success)',
                                  }}>
                                    Scale Set
                                  </span>
                                )}
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button
                                onClick={() => navigate(`/admin/buildings/${building.id}/floors/${floor.id}/editor`)}
                                className="btn-primary"
                                style={{ padding: '6px 16px', fontSize: '0.78rem' }}
                              >
                                Open Editor →
                              </button>
                              <button
                                onClick={() => handleDeleteFloor(floor.id, floor.name)}
                                className="btn-secondary"
                                style={{ padding: '6px 10px', fontSize: '0.75rem', color: 'var(--color-error)' }}
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add Floor Form */}
                    {addingFloorFor === building.id ? (
                      <form
                        onSubmit={(e) => handleCreateFloor(e, building.id)}
                        style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}
                      >
                        <div style={{ flex: 1 }}>
                          <label className="input-label" style={{ fontSize: '0.75rem' }}>Floor Name</label>
                          <input
                            type="text"
                            className="input-field"
                            placeholder="e.g. Ground Floor, First Floor"
                            value={newFloorName}
                            onChange={(e) => setNewFloorName(e.target.value)}
                            required
                            autoFocus
                            style={{ padding: '8px 12px', fontSize: '0.85rem' }}
                          />
                        </div>
                        <div style={{ width: '80px' }}>
                          <label className="input-label" style={{ fontSize: '0.75rem' }}>Level</label>
                          <input
                            type="number"
                            className="input-field"
                            value={newFloorLevel}
                            onChange={(e) => setNewFloorLevel(parseInt(e.target.value) || 0)}
                            style={{ padding: '8px 12px', fontSize: '0.85rem' }}
                          />
                        </div>
                        <button
                          type="submit"
                          className="btn-primary"
                          disabled={creatingFloor}
                          style={{ padding: '8px 16px', fontSize: '0.8rem', whiteSpace: 'nowrap' }}
                        >
                          {creatingFloor ? '...' : 'Add'}
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => { setAddingFloorFor(null); setNewFloorName(''); setNewFloorLevel(0); }}
                          style={{ padding: '8px 12px', fontSize: '0.8rem' }}
                        >
                          ✕
                        </button>
                      </form>
                    ) : (
                      <button
                        onClick={() => { setAddingFloorFor(building.id); setNewFloorLevel(floors.length); }}
                        className="btn-secondary"
                        style={{ width: '100%', padding: '8px', fontSize: '0.8rem' }}
                      >
                        + Add Floor
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
