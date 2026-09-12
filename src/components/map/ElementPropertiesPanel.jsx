import { CATEGORY_COLORS, CATEGORY_LABELS } from '../../lib/theme';
import { Trash2, X, Move, Compass, Tag, Link2, QrCode } from 'lucide-react';

const CATEGORIES = Object.keys(CATEGORY_LABELS);

const NODE_TYPE_OPTIONS = [
  { id: 'junction', label: 'Junction (Corridor)' },
  { id: 'stairs', label: 'Stairs' },
  { id: 'lift', label: 'Lift / Elevator' },
  { id: 'entrance', label: 'Entrance / Exit' },
  { id: 'room_door', label: 'Room Door' },
];

export default function ElementPropertiesPanel({
  selection, // { type: 'room' | 'node' | 'edge' | null, id: string | null }
  rooms,
  nodes,
  edges,
  qrPoints,
  pixelsPerMeter = 1,
  onUpdateRoom,
  onDeleteRoom,
  onUpdateNode,
  onDeleteNode,
  onDeleteEdge,
  onToggleQr,
  onClose,
}) {
  if (!selection || !selection.type || !selection.id) return null;

  // Render Room Properties
  if (selection.type === 'room') {
    const room = rooms.find((r) => r.id === selection.id);
    if (!room) return null;

    const currentCategory = room.category || 'other';

    return (
      <div style={panelContainerStyle}>
        {/* Header */}
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Tag size={16} className="text-blue-400" />
            <h3 style={{ fontWeight: 600, fontSize: '0.95rem' }}>Room Properties</h3>
          </div>
          <button onClick={onClose} style={closeButtonStyle} title="Close Panel">
            <X size={16} />
          </button>
        </div>

        {/* Room Name */}
        <div style={{ marginBottom: '14px' }}>
          <label style={labelStyle}>Name</label>
          <input
            type="text"
            value={room.name || ''}
            onChange={(e) => onUpdateRoom({ ...room, name: e.target.value })}
            placeholder="e.g. Room 101, Lab A"
            style={inputStyle}
          />
        </div>

        {/* Category */}
        <div style={{ marginBottom: '14px' }}>
          <label style={labelStyle}>Category</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
            {CATEGORIES.map((cat) => {
              const isSelected = currentCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => onUpdateRoom({ ...room, category: cat })}
                  style={{
                    padding: '6px 8px',
                    borderRadius: '6px',
                    border: isSelected
                      ? `2px solid ${CATEGORY_COLORS[cat]}`
                      : '1px solid rgba(255,255,255,0.08)',
                    background: isSelected ? `${CATEGORY_COLORS[cat]}25` : 'rgba(255,255,255,0.03)',
                    color: isSelected ? CATEGORY_COLORS[cat] : '#9ca3af',
                    cursor: 'pointer',
                    fontSize: '0.72rem',
                    fontWeight: isSelected ? 600 : 400,
                    textAlign: 'left',
                    fontFamily: 'inherit',
                    transition: 'all 0.15s',
                  }}
                >
                  {CATEGORY_LABELS[cat]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Color Override */}
        <div style={{ marginBottom: '20px' }}>
          <label style={labelStyle}>Color Override</label>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              type="color"
              value={room.color || CATEGORY_COLORS[currentCategory] || '#A3A3A3'}
              onChange={(e) => onUpdateRoom({ ...room, color: e.target.value })}
              style={{
                width: '36px',
                height: '36px',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                background: 'transparent',
              }}
            />
            <span style={{ fontSize: '0.78rem', color: '#9ca3af' }}>
              {room.color ? 'Custom color' : 'Category default'}
            </span>
            {room.color && (
              <button
                onClick={() => onUpdateRoom({ ...room, color: null })}
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  border: 'none',
                  color: '#9ca3af',
                  cursor: 'pointer',
                  borderRadius: '4px',
                  padding: '2px 8px',
                  fontSize: '0.7rem',
                  fontFamily: 'inherit',
                }}
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Delete Room */}
        <button
          onClick={() => onDeleteRoom(room.id)}
          style={deleteButtonStyle}
        >
          <Trash2 size={14} style={{ marginRight: '6px' }} />
          Delete Room
        </button>
      </div>
    );
  }

  // Render Node Properties
  if (selection.type === 'node') {
    const node = nodes.find((n) => n.id === selection.id);
    if (!node) return null;

    const hasQr = qrPoints.some((q) => q.node_id === node.id);

    return (
      <div style={panelContainerStyle}>
        {/* Header */}
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Compass size={16} className="text-orange-400" />
            <h3 style={{ fontWeight: 600, fontSize: '0.95rem' }}>Node Properties</h3>
          </div>
          <button onClick={onClose} style={closeButtonStyle} title="Close Panel">
            <X size={16} />
          </button>
        </div>

        {/* Node Type */}
        <div style={{ marginBottom: '14px' }}>
          <label style={labelStyle}>Node Type</label>
          <select
            value={node.type || 'junction'}
            onChange={(e) => onUpdateNode({ ...node, type: e.target.value })}
            style={selectStyle}
          >
            {NODE_TYPE_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id} style={{ background: '#181820', color: '#fff' }}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Coordinates */}
        <div style={{ marginBottom: '14px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <div>
            <label style={labelStyle}>X (px)</label>
            <input
              type="number"
              value={Math.round(node.x)}
              onChange={(e) => onUpdateNode({ ...node, x: parseFloat(e.target.value) || 0 })}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Y (px)</label>
            <input
              type="number"
              value={Math.round(node.y)}
              onChange={(e) => onUpdateNode({ ...node, y: parseFloat(e.target.value) || 0 })}
              style={inputStyle}
            />
          </div>
        </div>

        {/* QR Anchor */}
        <div style={{ marginBottom: '20px', padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <QrCode size={14} className="text-purple-400" />
              QR Checkpoint
            </span>
            <span style={{
              fontSize: '0.7rem',
              padding: '2px 6px',
              borderRadius: '4px',
              background: hasQr ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255,255,255,0.06)',
              color: hasQr ? '#a78bfa' : '#9ca3af'
            }}>
              {hasQr ? 'Assigned' : 'None'}
            </span>
          </div>
          <button
            onClick={() => onToggleQr(node.id)}
            style={{
              width: '100%',
              padding: '6px 10px',
              borderRadius: '6px',
              background: hasQr ? 'rgba(239, 68, 68, 0.15)' : 'rgba(139, 92, 246, 0.2)',
              border: hasQr ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(139, 92, 246, 0.4)',
              color: hasQr ? '#fca5a5' : '#c4b5fd',
              fontSize: '0.75rem',
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {hasQr ? 'Remove QR Checkpoint' : '+ Assign QR Checkpoint'}
          </button>
        </div>

        {/* Delete Node */}
        <button
          onClick={() => onDeleteNode(node.id)}
          style={deleteButtonStyle}
        >
          <Trash2 size={14} style={{ marginRight: '6px' }} />
          Delete Node
        </button>
      </div>
    );
  }

  // Render Edge Properties
  if (selection.type === 'edge') {
    const edge = edges.find((e) => e.id === selection.id);
    if (!edge) return null;

    const n1 = nodes.find((n) => n.id === edge.from_node);
    const n2 = nodes.find((n) => n.id === edge.to_node);

    let pixelDist = 0;
    if (n1 && n2) {
      const dx = n2.x - n1.x;
      const dy = n2.y - n1.y;
      pixelDist = Math.sqrt(dx * dx + dy * dy);
    }
    const meterDist = pixelsPerMeter > 0 ? (pixelDist / pixelsPerMeter).toFixed(2) : '0';

    return (
      <div style={panelContainerStyle}>
        {/* Header */}
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Link2 size={16} className="text-blue-400" />
            <h3 style={{ fontWeight: 600, fontSize: '0.95rem' }}>Path Segment</h3>
          </div>
          <button onClick={onClose} style={closeButtonStyle} title="Close Panel">
            <X size={16} />
          </button>
        </div>

        {/* Computed Distance */}
        <div style={{ marginBottom: '16px', padding: '12px', background: 'rgba(59, 130, 246, 0.08)', borderRadius: '10px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
          <label style={{ ...labelStyle, color: '#93c5fd' }}>Computed Distance</label>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#60a5fa' }}>
            {meterDist} <span style={{ fontSize: '0.85rem', fontWeight: 400, color: '#bfdbfe' }}>meters</span>
          </div>
          <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: '4px' }}>
            {Math.round(pixelDist)} canvas pixels
          </div>
        </div>

        {/* Connected Nodes info */}
        <div style={{ marginBottom: '16px', fontSize: '0.78rem', color: '#9ca3af' }}>
          <div>From: <span style={{ color: '#f3f4f6' }}>{n1 ? `${n1.type} (${Math.round(n1.x)}, ${Math.round(n1.y)})` : 'Unknown'}</span></div>
          <div style={{ marginTop: '4px' }}>To: <span style={{ color: '#f3f4f6' }}>{n2 ? `${n2.type} (${Math.round(n2.x)}, ${Math.round(n2.y)})` : 'Unknown'}</span></div>
        </div>

        {/* Delete Edge */}
        <button
          onClick={() => onDeleteEdge(edge.id)}
          style={deleteButtonStyle}
        >
          <Trash2 size={14} style={{ marginRight: '6px' }} />
          Delete Path Segment
        </button>
      </div>
    );
  }

  return null;
}

// Styles
const panelContainerStyle = {
  position: 'absolute',
  top: '80px',
  right: '16px',
  width: '290px',
  background: 'rgba(12, 12, 18, 0.94)',
  backdropFilter: 'blur(20px)',
  border: '1px solid rgba(255, 255, 255, 0.12)',
  borderRadius: '16px',
  padding: '18px',
  zIndex: 30,
  boxShadow: '0 16px 40px rgba(0,0,0,0.6)',
  color: '#f0f0f5',
  animation: 'fadeIn 0.15s ease-out',
};

const headerStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: '16px',
  borderBottom: '1px solid rgba(255,255,255,0.08)',
  paddingBottom: '10px',
};

const closeButtonStyle = {
  background: 'rgba(255,255,255,0.08)',
  border: 'none',
  color: '#9ca3af',
  cursor: 'pointer',
  borderRadius: '6px',
  width: '26px',
  height: '26px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'background 0.15s',
};

const labelStyle = {
  display: 'block',
  marginBottom: '5px',
  fontSize: '0.74rem',
  fontWeight: 500,
  color: '#9ca3af',
};

const inputStyle = {
  width: '100%',
  padding: '8px 12px',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: '8px',
  color: '#f0f0f5',
  fontSize: '0.85rem',
  outline: 'none',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

const selectStyle = {
  width: '100%',
  padding: '8px 12px',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: '8px',
  color: '#f0f0f5',
  fontSize: '0.85rem',
  outline: 'none',
  fontFamily: 'inherit',
  cursor: 'pointer',
  boxSizing: 'border-box',
};

const deleteButtonStyle = {
  width: '100%',
  padding: '9px',
  background: 'rgba(239, 68, 68, 0.12)',
  border: '1px solid rgba(239, 68, 68, 0.25)',
  borderRadius: '8px',
  color: '#ef4444',
  cursor: 'pointer',
  fontSize: '0.8rem',
  fontWeight: 500,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'inherit',
  transition: 'all 0.15s',
};
