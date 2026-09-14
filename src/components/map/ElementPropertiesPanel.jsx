import { CATEGORY_COLORS, CATEGORY_LABELS } from '../../lib/theme';
import { Trash2, X, Move, Compass, Tag, Link2, QrCode, Layers, BrickWall, DoorOpen } from 'lucide-react';

const CATEGORIES = Object.keys(CATEGORY_LABELS);

// Shoelace Formula (Gauss's Area Formula) for arbitrary 2D polygons
function calculatePolygonArea(pts) {
  if (!pts || pts.length < 6) return 0;
  let area = 0;
  const n = pts.length / 2;
  for (let i = 0; i < n; i++) {
    const x1 = pts[i * 2];
    const y1 = pts[i * 2 + 1];
    const x2 = pts[((i + 1) % n) * 2];
    const y2 = pts[((i + 1) % n) * 2 + 1];
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area) / 2;
}

const NODE_TYPE_OPTIONS = [
  { id: 'junction', label: 'Junction (Corridor)' },
  { id: 'stairs', label: 'Stairs' },
  { id: 'lift', label: 'Lift / Elevator' },
  { id: 'entrance', label: 'Entrance / Exit' },
  { id: 'room_door', label: 'Room Door' },
];

export default function ElementPropertiesPanel({
  selection, // { type, id, ids: Set, items: [] }
  rooms = [],
  nodes = [],
  edges = [],
  qrPoints = [],
  walls = [],
  doors = [],
  pixelsPerMeter = 1,
  onUpdateRoom,
  onDeleteRoom,
  onUpdateNode,
  onDeleteNode,
  onDeleteEdge,
  onUpdateWall,
  onDeleteWall,
  onUpdateDoor,
  onDeleteDoor,
  onAddNodeAtDoor,
  onDeleteSelected,
  onToggleQr,
  onClose,
}) {
  if (!selection || (!selection.id && (!selection.ids || selection.ids.size === 0))) {
    return null;
  }

  const selectedCount = selection.ids ? selection.ids.size : selection.id ? 1 : 0;

  // ==========================================
  // MULTI-SELECTION VIEW
  // ==========================================
  if (selectedCount > 1) {
    const selectedIds = Array.from(selection.ids);
    const selectedRooms = rooms.filter((r) => selectedIds.includes(r.id));
    const selectedNodes = nodes.filter((n) => selectedIds.includes(n.id));
    const selectedEdges = edges.filter((e) => selectedIds.includes(e.id));
    const selectedWalls = (walls || []).filter((w) => selectedIds.includes(w.id));
    const selectedDoors = (doors || []).filter((d) => selectedIds.includes(d.id));

    return (
      <div style={panelContainerStyle}>
        {/* Header */}
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Layers size={16} className="text-blue-400" />
            <h3 style={{ fontWeight: 600, fontSize: '0.95rem' }}>Multi-Selection</h3>
          </div>
          <button onClick={onClose} style={closeButtonStyle} title="Close / Deselect All">
            <X size={16} />
          </button>
        </div>

        {/* Count Summary */}
        <div style={{ marginBottom: '14px', padding: '10px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '10px', border: '1px solid rgba(59, 130, 246, 0.25)' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#93c5fd' }}>
            {selectedCount} elements selected
          </div>
          <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
            {selectedWalls.length > 0 && (
              <span style={badgeStyle}>
                <BrickWall size={11} style={{ marginRight: '4px' }} className="text-amber-400" />
                {selectedWalls.length} Wall{selectedWalls.length > 1 ? 's' : ''}
              </span>
            )}
            {selectedDoors.length > 0 && (
              <span style={badgeStyle}>
                <DoorOpen size={11} style={{ marginRight: '4px' }} className="text-emerald-400" />
                {selectedDoors.length} Door{selectedDoors.length > 1 ? 's' : ''}
              </span>
            )}
            {selectedRooms.length > 0 && (
              <span style={badgeStyle}>
                <Tag size={11} style={{ marginRight: '4px' }} />
                {selectedRooms.length} Room{selectedRooms.length > 1 ? 's' : ''}
              </span>
            )}
            {selectedNodes.length > 0 && (
              <span style={badgeStyle}>
                <Compass size={11} style={{ marginRight: '4px' }} />
                {selectedNodes.length} Node{selectedNodes.length > 1 ? 's' : ''}
              </span>
            )}
            {selectedEdges.length > 0 && (
              <span style={badgeStyle}>
                <Link2 size={11} style={{ marginRight: '4px' }} />
                {selectedEdges.length} Path{selectedEdges.length > 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        {/* Selected Items List */}
        <div style={{ marginBottom: '16px', maxHeight: '180px', overflowY: 'auto' }}>
          <label style={labelStyle}>Selected Elements</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {selectedWalls.map((w) => (
              <div key={w.id} style={itemRowStyle}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: '#e5e7eb' }}>
                  <BrickWall size={12} className="text-amber-400" />
                  Wall ({Math.round(w.x1)}, {Math.round(w.y1)}) → ({Math.round(w.x2)}, {Math.round(w.y2)})
                </span>
                <button
                  onClick={() => onDeleteWall && onDeleteWall(w.id)}
                  style={itemDeleteBtnStyle}
                  title="Remove this wall"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            {selectedDoors.map((d) => (
              <div key={d.id} style={itemRowStyle}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: '#e5e7eb' }}>
                  <DoorOpen size={12} className="text-emerald-400" />
                  Door ({Math.round((d.position_along_wall || 0.5) * 100)}%)
                </span>
                <button
                  onClick={() => onDeleteDoor && onDeleteDoor(d.id)}
                  style={itemDeleteBtnStyle}
                  title="Remove this door"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            {selectedRooms.map((r) => (
              <div key={r.id} style={itemRowStyle}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: '#e5e7eb' }}>
                  <Tag size={12} className="text-blue-400" />
                  {r.name}
                </span>
                <button
                  onClick={() => onDeleteRoom(r.id)}
                  style={itemDeleteBtnStyle}
                  title="Remove this room"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            {selectedNodes.map((n) => (
              <div key={n.id} style={itemRowStyle}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: '#e5e7eb' }}>
                  <Compass size={12} className="text-orange-400" />
                  {n.type} ({Math.round(n.x)}, {Math.round(n.y)})
                </span>
                <button
                  onClick={() => onDeleteNode(n.id)}
                  style={itemDeleteBtnStyle}
                  title="Remove this node"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            {selectedEdges.map((e) => (
              <div key={e.id} style={itemRowStyle}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: '#e5e7eb' }}>
                  <Link2 size={12} className="text-cyan-400" />
                  Path segment
                </span>
                <button
                  onClick={() => onDeleteEdge(e.id)}
                  style={itemDeleteBtnStyle}
                  title="Remove this path"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Bulk Delete Button */}
        <button
          onClick={onDeleteSelected}
          style={{
            ...deleteButtonStyle,
            background: 'rgba(239, 68, 68, 0.2)',
            borderColor: 'rgba(239, 68, 68, 0.4)',
            color: '#fca5a5',
            fontWeight: 600,
          }}
        >
          <Trash2 size={15} style={{ marginRight: '6px' }} />
          Delete Selected ({selectedCount})
        </button>
      </div>
    );
  }

  // ==========================================
  // SINGLE ROOM VIEW
  // ==========================================
  if (selection.type === 'room' || (rooms.some((r) => r.id === selection.id))) {
    const room = rooms.find((r) => r.id === selection.id);
    if (!room) return null;

    const currentCategory = room.category || 'other';

    return (
      <div style={panelContainerStyle}>
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
            placeholder="e.g. Living Room, Bedroom"
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

        {/* Real-World Area & Geometry */}
        {(() => {
          const pixelArea = calculatePolygonArea(room.shape_data);
          const hasCalibratedScale = pixelsPerMeter && pixelsPerMeter > 1;
          const realAreaM2 = hasCalibratedScale ? pixelArea / (pixelsPerMeter * pixelsPerMeter) : null;
          const realAreaSqFt = realAreaM2 !== null ? realAreaM2 * 10.7639 : null;
          const vertexCount = (room.shape_data?.length || 0) / 2;

          return (
            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>Dimensions & Area</label>
              <div
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '12px',
                  padding: '12px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                  <span style={{ fontSize: '0.78rem', color: '#9ca3af' }}>Floor Area:</span>
                  <span id="room-area-m2" style={{ fontSize: '1.05rem', fontWeight: 700, color: '#60a5fa' }}>
                    {realAreaM2 !== null ? `${realAreaM2.toFixed(1)} m²` : `${Math.round(pixelArea)} px²`}
                  </span>
                </div>
                {realAreaSqFt !== null && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#6b7280', marginBottom: '8px' }}>
                    <span>Imperial:</span>
                    <span>{realAreaSqFt.toFixed(1)} sq ft</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#9ca3af', paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <span>Shape Vertices:</span>
                  <span style={{ fontWeight: 600, color: '#e5e7eb' }}>
                    {vertexCount} corners {vertexCount === 4 ? '(Rectangle)' : ''}
                  </span>
                </div>
                {!hasCalibratedScale && (
                  <div style={{ marginTop: '8px', fontSize: '0.7rem', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span>⚠️ Calibrate floor scale to see real-world m²</span>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

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

  // ==========================================
  // SINGLE NODE VIEW
  // ==========================================
  if (selection.type === 'node' || (nodes.some((n) => n.id === selection.id))) {
    const node = nodes.find((n) => n.id === selection.id);
    if (!node) return null;

    const hasQr = qrPoints.some((q) => q.node_id === node.id);

    return (
      <div style={panelContainerStyle}>
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

  // ==========================================
  // SINGLE EDGE VIEW
  // ==========================================
  if (selection.type === 'edge' || (edges.some((e) => e.id === selection.id))) {
    const edge = edges.find((e) => e.id === selection.id);
    if (!edge) return null;

    const n1 = nodes.find((n) => n.id === edge.from_node);
    const n2 = nodes.find((n) => n.id === edge.to_node);

    let pixelDist = 0;
    if (n1 && n2) {
      const dx = n2.x - n1.x;
      const dy = n2.y - n1.y;
      pixelDist = Math.hypot(dx, dy);
    }
    const meterDist = pixelsPerMeter > 0 ? (pixelDist / pixelsPerMeter).toFixed(2) : '0';

    return (
      <div style={panelContainerStyle}>
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
            {Math.round(pixelDist)} canvas pixels ({pixelsPerMeter.toFixed(1)} px/m)
          </div>
        </div>

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

  // ==========================================
  // SINGLE WALL VIEW
  // ==========================================
  if (selection.type === 'wall' || (walls && walls.some((w) => w.id === selection.id))) {
    const wall = (walls || []).find((w) => w.id === selection.id);
    if (!wall) return null;

    const dx = wall.x2 - wall.x1;
    const dy = wall.y2 - wall.y1;
    const pixelLen = Math.hypot(dx, dy);
    const meterLen = (pixelLen / pixelsPerMeter).toFixed(2);
    const thickness = wall.thickness || 12;
    const thicknessCm = ((thickness / pixelsPerMeter) * 100).toFixed(1);
    const attachedDoors = (doors || []).filter((d) => d.wall_id === wall.id);

    return (
      <div style={panelContainerStyle}>
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <BrickWall size={16} className="text-amber-400" />
            <h3 style={{ fontWeight: 600, fontSize: '0.95rem' }}>Wall Properties</h3>
          </div>
          <button onClick={onClose} style={closeButtonStyle} title="Close Panel">
            <X size={16} />
          </button>
        </div>

        {/* Wall Length Readout */}
        <div style={{ marginBottom: '16px', padding: '12px', background: 'rgba(255,255,255,0.04)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize: '0.72rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Wall Length
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#f3f4f6', marginTop: '2px' }}>
            {meterLen} <span style={{ fontSize: '0.85rem', fontWeight: 400, color: '#bfdbfe' }}>meters</span>
          </div>
          <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: '4px' }}>
            {Math.round(pixelLen)} canvas pixels
          </div>
        </div>

        {/* Thickness Input */}
        <div style={{ marginBottom: '14px' }}>
          <label style={labelStyle}>Thickness ({thicknessCm} cm)</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="number"
              min="4"
              max="50"
              value={Math.round(thickness)}
              onChange={(e) => onUpdateWall && onUpdateWall({ ...wall, thickness: Math.max(4, parseFloat(e.target.value) || 12) })}
              style={{ ...inputStyle, flex: 1 }}
            />
            <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>px</span>
          </div>
        </div>

        {/* Attached Doors count & coords */}
        <div style={{ marginBottom: '16px', fontSize: '0.78rem', color: '#9ca3af' }}>
          <div>Attached Doors: <span style={{ color: '#f3f4f6', fontWeight: 600 }}>{attachedDoors.length}</span></div>
          <div style={{ marginTop: '4px' }}>From: ({Math.round(wall.x1)}, {Math.round(wall.y1)}) → To: ({Math.round(wall.x2)}, {Math.round(wall.y2)})</div>
        </div>

        {/* Delete Wall Button */}
        <button
          onClick={() => onDeleteWall && onDeleteWall(wall.id)}
          style={deleteButtonStyle}
        >
          <Trash2 size={14} style={{ marginRight: '6px' }} />
          Delete Wall
        </button>
      </div>
    );
  }

  // ==========================================
  // SINGLE DOOR VIEW
  // ==========================================
  if (selection.type === 'door' || (doors && doors.some((d) => d.id === selection.id))) {
    const door = (doors || []).find((d) => d.id === selection.id);
    if (!door) return null;

    const widthPx = door.width || 40;
    const widthMeters = (widthPx / pixelsPerMeter).toFixed(2);
    const posPercent = Math.round((door.position_along_wall || 0.5) * 100);

    return (
      <div style={panelContainerStyle}>
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <DoorOpen size={16} className="text-emerald-400" />
            <h3 style={{ fontWeight: 600, fontSize: '0.95rem' }}>Door Properties</h3>
          </div>
          <button onClick={onClose} style={closeButtonStyle} title="Close Panel">
            <X size={16} />
          </button>
        </div>

        {/* Door Width */}
        <div style={{ marginBottom: '14px' }}>
          <label style={labelStyle}>Door Opening ({widthMeters} m)</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="number"
              min="15"
              max="150"
              value={Math.round(widthPx)}
              onChange={(e) => onUpdateDoor && onUpdateDoor({ ...door, width: Math.max(15, parseFloat(e.target.value) || 40) })}
              style={{ ...inputStyle, flex: 1 }}
            />
            <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>px</span>
          </div>
        </div>

        {/* Position along wall slider */}
        <div style={{ marginBottom: '14px' }}>
          <label style={labelStyle}>Position Along Wall ({posPercent}%)</label>
          <input
            type="range"
            min="10"
            max="90"
            value={posPercent}
            onChange={(e) => onUpdateDoor && onUpdateDoor({ ...door, position_along_wall: parseFloat(e.target.value) / 100 })}
            style={{ width: '100%', accentColor: '#3B82F6' }}
          />
        </div>

        {/* Swing Direction */}
        <div style={{ marginBottom: '16px' }}>
          <label style={labelStyle}>Swing Orientation</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
            {[
              { id: 'right_in', label: 'Right In' },
              { id: 'left_in', label: 'Left In' },
              { id: 'right_out', label: 'Right Out' },
              { id: 'left_out', label: 'Left Out' },
            ].map((dir) => (
              <button
                key={dir.id}
                onClick={() => onUpdateDoor && onUpdateDoor({ ...door, swing_direction: dir.id })}
                style={{
                  padding: '6px',
                  borderRadius: '8px',
                  fontSize: '0.72rem',
                  fontWeight: door.swing_direction === dir.id ? 600 : 400,
                  border: door.swing_direction === dir.id ? '1px solid #3B82F6' : '1px solid rgba(255,255,255,0.1)',
                  background: door.swing_direction === dir.id ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255,255,255,0.03)',
                  color: door.swing_direction === dir.id ? '#60A5FA' : '#9ca3af',
                  cursor: 'pointer',
                }}
              >
                {dir.label}
              </button>
            ))}
          </div>
        </div>

        {/* Add corridor node at this door button */}
        <div style={{ marginBottom: '16px' }}>
          <button
            onClick={() => onAddNodeAtDoor && onAddNodeAtDoor(door)}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: '8px',
              background: 'rgba(59, 130, 246, 0.15)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
              color: '#93c5fd',
              fontSize: '0.78rem',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <Compass size={13} />
            Place Corridor Node at Door
          </button>
        </div>

        {/* Delete Door */}
        <button
          onClick={() => onDeleteDoor && onDeleteDoor(door.id)}
          style={deleteButtonStyle}
        >
          <Trash2 size={14} style={{ marginRight: '6px' }} />
          Delete Door
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
  width: '300px',
  background: 'rgba(12, 12, 18, 0.95)',
  backdropFilter: 'blur(20px)',
  border: '1px solid rgba(255, 255, 255, 0.12)',
  borderRadius: '16px',
  padding: '18px',
  zIndex: 30,
  boxShadow: '0 16px 40px rgba(0,0,0,0.6)',
  color: '#f0f0f5',
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

const badgeStyle = {
  fontSize: '0.7rem',
  padding: '3px 8px',
  borderRadius: '6px',
  background: 'rgba(255, 255, 255, 0.08)',
  color: '#d1d5db',
  display: 'inline-flex',
  alignItems: 'center',
};

const itemRowStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '5px 8px',
  background: 'rgba(255, 255, 255, 0.03)',
  borderRadius: '6px',
  border: '1px solid rgba(255, 255, 255, 0.06)',
};

const itemDeleteBtnStyle = {
  background: 'transparent',
  border: 'none',
  color: '#ef4444',
  cursor: 'pointer',
  padding: '2px',
  display: 'flex',
  alignItems: 'center',
};
