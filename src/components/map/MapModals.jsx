import { useState } from 'react';
import { X, Ruler, Image as ImageIcon, Check } from 'lucide-react';

/**
 * ScaleCalibrationModal
 * Replaces window.prompt() for setting real-world meters from a measured line.
 */
export function ScaleCalibrationModal({ pixelDistance, onConfirm, onCancel }) {
  const [meters, setMeters] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const val = parseFloat(meters);
    if (!val || val <= 0) {
      setError('Please enter a valid positive number for real-world meters.');
      return;
    }
    onConfirm(val);
  };

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Ruler size={18} className="text-blue-400" />
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Calibrate Map Scale</h3>
          </div>
          <button onClick={onCancel} style={closeBtnStyle}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <p style={{ fontSize: '0.85rem', color: '#9ca3af', marginBottom: '16px', lineHeight: 1.5 }}>
            You drew a calibration line measuring{' '}
            <span style={{ color: '#60a5fa', fontWeight: 600 }}>{pixelDistance.toFixed(1)} pixels</span>.
            How many real-world <strong>meters</strong> does this line represent?
          </p>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', color: '#9ca3af', marginBottom: '6px' }}>
              Real-world distance (meters)
            </label>
            <input
              type="number"
              step="any"
              min="0.1"
              autoFocus
              value={meters}
              onChange={(e) => {
                setMeters(e.target.value);
                setError('');
              }}
              placeholder="e.g. 10 or 25.5"
              style={inputStyle}
            />
            {error && <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '4px' }}>{error}</p>}
          </div>

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button type="button" onClick={onCancel} style={cancelBtnStyle}>
              Cancel
            </button>
            <button type="submit" style={confirmBtnStyle}>
              <Check size={14} style={{ marginRight: '4px' }} />
              Apply Scale
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * BlueprintUploadModal
 * Replaces window.prompt() for entering a blueprint floor plan image URL.
 */
export function BlueprintUploadModal({ currentUrl, onConfirm, onCancel }) {
  const [url, setUrl] = useState(currentUrl || '');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!url.trim()) {
      setError('Please provide a valid image URL');
      return;
    }
    onConfirm(url.trim());
  };

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ImageIcon size={18} className="text-purple-400" />
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Set Blueprint Plan</h3>
          </div>
          <button onClick={onCancel} style={closeBtnStyle}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <p style={{ fontSize: '0.85rem', color: '#9ca3af', marginBottom: '16px', lineHeight: 1.5 }}>
            Enter a public URL to your architectural floor plan or layout image (PNG/JPG/SVG):
          </p>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', color: '#9ca3af', marginBottom: '6px' }}>
              Image URL
            </label>
            <input
              type="url"
              autoFocus
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setError('');
              }}
              placeholder="https://example.com/floor1.png"
              style={inputStyle}
            />
            {error && <p style={{ color: '#ef4444', fontSize: '0.75rem', marginTop: '4px' }}>{error}</p>}
          </div>

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            {currentUrl && (
              <button
                type="button"
                onClick={() => onConfirm(null)}
                style={{ ...cancelBtnStyle, color: '#ef4444', marginRight: 'auto' }}
              >
                Remove Blueprint
              </button>
            )}
            <button type="button" onClick={onCancel} style={cancelBtnStyle}>
              Cancel
            </button>
            <button type="submit" style={confirmBtnStyle}>
              Load Image
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Modal Styles
const overlayStyle = {
  position: 'fixed',
  inset: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.7)',
  backdropFilter: 'blur(4px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 100,
  animation: 'fadeIn 0.15s ease-out',
};

const modalStyle = {
  width: '100%',
  maxWidth: '420px',
  backgroundColor: '#12121a',
  border: '1px solid rgba(255, 255, 255, 0.12)',
  borderRadius: '16px',
  padding: '24px',
  boxShadow: '0 20px 50px rgba(0,0,0,0.8)',
  color: '#f0f0f5',
};

const headerStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: '16px',
};

const closeBtnStyle = {
  background: 'transparent',
  border: 'none',
  color: '#9ca3af',
  cursor: 'pointer',
  padding: '4px',
  borderRadius: '6px',
};

const inputStyle = {
  width: '100%',
  padding: '10px 14px',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: '8px',
  color: '#f0f0f5',
  fontSize: '0.9rem',
  outline: 'none',
  boxSizing: 'border-box',
};

const cancelBtnStyle = {
  padding: '8px 16px',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: '8px',
  color: '#d1d5db',
  cursor: 'pointer',
  fontSize: '0.85rem',
  fontWeight: 500,
};

const confirmBtnStyle = {
  padding: '8px 16px',
  background: '#2563eb',
  border: 'none',
  borderRadius: '8px',
  color: '#ffffff',
  cursor: 'pointer',
  fontSize: '0.85rem',
  fontWeight: 600,
  display: 'flex',
  alignItems: 'center',
};
