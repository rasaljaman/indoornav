import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

export default function SuperAdminDashboard() {
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState({ name: '', type: 'college', slug: '' });
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  useEffect(() => {
    loadOrganizations();
  }, []);

  async function loadOrganizations() {
    try {
      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setOrganizations(data || []);
    } catch (err) {
      console.error('Error loading organizations:', err);
    } finally {
      setLoading(false);
    }
  }

  function generateSlug(name) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }

  function handleNameChange(name) {
    setFormData(prev => ({
      ...prev,
      name,
      slug: generateSlug(name),
    }));
  }

  async function handleCreateOrg(e) {
    e.preventDefault();
    setFormError('');
    setFormLoading(true);

    try {
      if (!formData.name.trim()) throw new Error('Name is required');
      if (!formData.slug.trim()) throw new Error('Slug is required');

      const { error } = await supabase
        .from('organizations')
        .insert({
          name: formData.name.trim(),
          type: formData.type,
          slug: formData.slug.trim(),
        });

      if (error) {
        if (error.code === '23505') throw new Error('Slug already taken');
        throw error;
      }

      setFormData({ name: '', type: 'college', slug: '' });
      setShowCreateForm(false);
      await loadOrganizations();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setFormLoading(false);
    }
  }

  async function handleDeleteOrg(orgId, orgName) {
    if (!window.confirm(`Delete "${orgName}" and ALL its data? This cannot be undone.`)) return;

    try {
      const { error } = await supabase
        .from('organizations')
        .delete()
        .eq('id', orgId);
      if (error) throw error;
      await loadOrganizations();
    } catch (err) {
      console.error('Error deleting organization:', err);
      alert('Failed to delete organization: ' + err.message);
    }
  }

  const orgTypeIcon = {
    college: '🎓',
    hospital: '🏥',
    mall: '🛍️',
    other: '🏢',
  };

  if (loading) {
    return (
      <div className="page-container" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 'calc(100vh - 64px)',
      }}>
        <div className="animate-pulse-slow" style={{ color: 'var(--color-text-secondary)' }}>
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="page-container animate-fade-in">
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '24px',
        flexWrap: 'wrap',
        gap: '16px',
      }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700 }}>Super Admin</h1>
          <p style={{ color: 'var(--color-text-secondary)' }}>
            Manage all organizations and their admins
          </p>
        </div>
        <span className="badge badge-purple">Super Admin</span>
      </div>

      {/* Stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
        marginBottom: '32px',
      }}>
        {[
          { label: 'Organizations', value: organizations.length, icon: '🏛️' },
          { label: 'Colleges', value: organizations.filter(o => o.type === 'college').length, icon: '🎓' },
          { label: 'Hospitals', value: organizations.filter(o => o.type === 'hospital').length, icon: '🏥' },
          { label: 'Malls', value: organizations.filter(o => o.type === 'mall').length, icon: '🛍️' },
        ].map((stat) => (
          <div key={stat.label} className="glass-card stat-card">
            <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>{stat.icon}</div>
            <div className="stat-value">{stat.value}</div>
            <div className="stat-label">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Create Organization */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '16px',
      }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Organizations</h2>
        <button
          className="btn-primary"
          style={{ padding: '8px 20px', fontSize: '0.85rem' }}
          onClick={() => setShowCreateForm(!showCreateForm)}
        >
          {showCreateForm ? 'Cancel' : '+ New Organization'}
        </button>
      </div>

      {/* Create Form */}
      {showCreateForm && (
        <div className="glass-card animate-slide-up" style={{ padding: '24px', marginBottom: '20px' }}>
          <h3 style={{ fontWeight: 600, marginBottom: '16px' }}>Create New Organization</h3>

          {formError && (
            <div style={{
              padding: '10px 14px',
              borderRadius: '8px',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              color: 'var(--color-error)',
              fontSize: '0.85rem',
              marginBottom: '16px',
            }}>
              {formError}
            </div>
          )}

          <form onSubmit={handleCreateOrg}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div>
                <label className="input-label">Organization Name</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="AKNM Polytechnic"
                  value={formData.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="input-label">Type</label>
                <select
                  className="input-field"
                  value={formData.type}
                  onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value }))}
                >
                  <option value="college">🎓 College</option>
                  <option value="hospital">🏥 Hospital</option>
                  <option value="mall">🛍️ Mall</option>
                  <option value="other">🏢 Other</option>
                </select>
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label className="input-label">URL Slug</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
                  indoornav.app/
                </span>
                <input
                  type="text"
                  className="input-field"
                  placeholder="aknm-polytechnic"
                  value={formData.slug}
                  onChange={(e) => setFormData(prev => ({ ...prev, slug: e.target.value }))}
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              className="btn-primary"
              disabled={formLoading}
              style={{ padding: '10px 24px', fontSize: '0.9rem' }}
            >
              {formLoading ? 'Creating...' : 'Create Organization'}
            </button>
          </form>
        </div>
      )}

      {/* Organizations List */}
      {organizations.length === 0 ? (
        <div className="glass-card" style={{ padding: '48px', textAlign: 'center' }}>
          <p style={{ fontSize: '2.5rem', marginBottom: '16px' }}>🏛️</p>
          <p style={{ color: 'var(--color-text-secondary)' }}>
            No organizations yet. Create your first one above.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {organizations.map(org => (
            <div key={org.id} className="glass-card" style={{
              padding: '20px 24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '16px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <span style={{
                  fontSize: '1.5rem',
                  width: '44px',
                  height: '44px',
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
                  <h3 style={{ fontWeight: 600, marginBottom: '2px' }}>{org.name}</h3>
                  <div style={{
                    display: 'flex',
                    gap: '12px',
                    color: 'var(--color-text-muted)',
                    fontSize: '0.8rem',
                  }}>
                    <span>/{org.slug}</span>
                    <span>•</span>
                    <span style={{ textTransform: 'capitalize' }}>{org.type}</span>
                    <span>•</span>
                    <span>{new Date(org.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                <button
                  className="btn-secondary"
                  style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                  onClick={() => handleDeleteOrg(org.id, org.name)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
