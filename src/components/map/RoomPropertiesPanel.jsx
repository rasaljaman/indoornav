import { CATEGORY_COLORS, CATEGORY_LABELS } from '../../lib/theme';

const CATEGORIES = Object.keys(CATEGORY_LABELS);

export default function RoomPropertiesPanel({ room, onUpdate, onDelete, onClose }) {
  if (!room) return null;

  function handleChange(field, value) {
    onUpdate({ ...room, [field]: value });
  }

  return (
    <div style={{
      position: 'absolute',
      top: '80px',
      right: '16px',
      width: '280px',
      background: 'rgba(10, 10, 15, 0.95)',
      backdropFilter: 'blur(20px)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      borderRadius: '16px',
      padding: '20px',
      zIndex: 30,
      boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
      color: '#f0f0f5',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '16px',
      }}>
        <h3 style={{ fontWeight: 600, fontSize: '0.95rem' }}>Room Properties</h3>
        <button
          onClick={onClose}
          style={{
            background: 'rgba(255,255,255,0.1)',
            border: 'none',
            color: '#9ca3af',
            cursor: 'pointer',
            borderRadius: '6px',
            width: '28px',
            height: '28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1rem',
          }}
        >
          ✕
        </button>
      </div>

      {/* Room Name */}
      <div style={{ marginBottom: '14px' }}>
        <label style={{
          display: 'block',
          marginBottom: '4px',
          fontSize: '0.75rem',
          fontWeight: 500,
          color: '#9ca3af',
        }}>
          Name
        </label>
        <input
          type="text"
          value={room.name || ''}
          onChange={(e) => handleChange('name', e.target.value)}
          placeholder="e.g. Room 101, Dean's Office"
          style={{
            width: '100%',
            padding: '8px 12px',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '8px',
            color: '#f0f0f5',
            fontSize: '0.85rem',
            outline: 'none',
            fontFamily: 'inherit',
          }}
        />
      </div>

      {/* Category */}
      <div style={{ marginBottom: '14px' }}>
        <label style={{
          display: 'block',
          marginBottom: '4px',
          fontSize: '0.75rem',
          fontWeight: 500,
          color: '#9ca3af',
        }}>
          Category
        </label>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '4px',
        }}>
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => handleChange('category', cat)}
              style={{
                padding: '6px 8px',
                borderRadius: '6px',
                border: room.category === cat
                  ? `2px solid ${CATEGORY_COLORS[cat]}`
                  : '1px solid rgba(255,255,255,0.08)',
                background: room.category === cat
                  ? `${CATEGORY_COLORS[cat]}20`
                  : 'rgba(255,255,255,0.03)',
                color: room.category === cat ? CATEGORY_COLORS[cat] : '#9ca3af',
                cursor: 'pointer',
                fontSize: '0.72rem',
                fontWeight: room.category === cat ? 600 : 400,
                fontFamily: 'inherit',
                textAlign: 'left',
                transition: 'all 0.15s',
              }}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>
      </div>

      {/* Color Override */}
      <div style={{ marginBottom: '20px' }}>
        <label style={{
          display: 'block',
          marginBottom: '4px',
          fontSize: '0.75rem',
          fontWeight: 500,
          color: '#9ca3af',
        }}>
          Color Override
        </label>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            type="color"
            value={room.color || CATEGORY_COLORS[room.category] || '#A3A3A3'}
            onChange={(e) => handleChange('color', e.target.value)}
            style={{
              width: '36px',
              height: '36px',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              background: 'transparent',
            }}
          />
          <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>
            {room.color || 'Using category default'}
          </span>
          {room.color && (
            <button
              onClick={() => handleChange('color', null)}
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: 'none',
                color: '#9ca3af',
                cursor: 'pointer',
                borderRadius: '4px',
                padding: '2px 6px',
                fontSize: '0.7rem',
                fontFamily: 'inherit',
              }}
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Delete Button */}
      <button
        onClick={() => onDelete(room.id)}
        style={{
          width: '100%',
          padding: '8px',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.2)',
          borderRadius: '8px',
          color: '#ef4444',
          cursor: 'pointer',
          fontSize: '0.8rem',
          fontWeight: 500,
          fontFamily: 'inherit',
          transition: 'all 0.15s',
        }}
      >
        Delete Room
      </button>
    </div>
  );
}
