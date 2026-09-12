import {
  MousePointer2,
  Square,
  Circle,
  TrendingUp,
  Scaling,
  Save,
  Image as ImageIcon,
  QrCode,
  Undo2,
  Redo2,
  Grid3X3,
  Magnet,
} from 'lucide-react';

const NODE_TYPES = [
  { id: 'junction', label: 'Junction', color: '#1A73E8' },
  { id: 'stairs', label: 'Stairs', color: '#F97316' },
  { id: 'lift', label: 'Lift', color: '#8B5CF6' },
  { id: 'entrance', label: 'Entrance', color: '#EF4444' },
  { id: 'room_door', label: 'Room Door', color: '#10B981' },
];

const GRID_SIZES = [10, 20, 50];

export default function MapToolbar({
  currentTool,
  setTool,
  nodeType,
  setNodeType,
  onSave,
  onUploadPlan,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  gridVisible = true,
  onToggleGrid,
  gridSize = 20,
  onChangeGridSize,
  snapEnabled = true,
  onToggleSnap,
  hasUnsavedChanges = false,
}) {
  const tools = [
    { id: 'select', icon: MousePointer2, label: 'Select / Pan (V)' },
    { id: 'room', icon: Square, label: 'Draw Room (R)' },
    { id: 'node', icon: Circle, label: 'Add Node (N)' },
    { id: 'edge', icon: TrendingUp, label: 'Draw Path (P)' },
    { id: 'scale', icon: Scaling, label: 'Calibrate Scale (S)' },
    { id: 'qr', icon: QrCode, label: 'Assign QR Anchor (Q)' },
  ];

  return (
    <div className="absolute left-4 top-20 bg-[#0d0d14]/90 backdrop-blur-xl border border-white/10 rounded-2xl p-2 flex flex-col gap-1.5 shadow-2xl z-10 select-none">
      {/* Undo / Redo */}
      <div className="flex gap-1 justify-between pb-1 border-b border-white/10">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          className={`p-2 rounded-xl transition-all group relative flex-1 flex justify-center items-center ${
            canUndo
              ? 'text-gray-300 hover:bg-white/10 hover:text-white cursor-pointer'
              : 'text-gray-600 cursor-not-allowed opacity-40'
          }`}
          title="Undo (Ctrl+Z)"
        >
          <Undo2 size={16} />
          <span className="absolute left-full ml-4 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none transition-opacity z-50">
            Undo (Ctrl+Z)
          </span>
        </button>

        <button
          onClick={onRedo}
          disabled={!canRedo}
          className={`p-2 rounded-xl transition-all group relative flex-1 flex justify-center items-center ${
            canRedo
              ? 'text-gray-300 hover:bg-white/10 hover:text-white cursor-pointer'
              : 'text-gray-600 cursor-not-allowed opacity-40'
          }`}
          title="Redo (Ctrl+Y)"
        >
          <Redo2 size={16} />
          <span className="absolute left-full ml-4 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none transition-opacity z-50">
            Redo (Ctrl+Y)
          </span>
        </button>
      </div>

      {/* Main Drawing Tools */}
      {tools.map(({ id, icon: Icon, label }) => (
        <button
          key={id}
          onClick={() => setTool(id)}
          className={`p-3 rounded-xl transition-all duration-200 group relative ${
            currentTool === id
              ? 'bg-blue-600 text-white shadow-[0_0_15px_rgba(59,130,246,0.5)]'
              : 'text-gray-400 hover:bg-white/10 hover:text-white'
          }`}
          title={label}
        >
          <Icon size={18} />
          <span className="absolute left-full ml-4 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none transition-opacity z-50">
            {label}
          </span>
        </button>
      ))}

      {/* Node Type Sub-selector (visible when node tool is active) */}
      {currentTool === 'node' && (
        <div className="border-t border-white/10 pt-2 mt-1 flex flex-col gap-1">
          {NODE_TYPES.map((nt) => (
            <button
              key={nt.id}
              onClick={() => setNodeType(nt.id)}
              style={{
                padding: '5px 8px',
                borderRadius: '6px',
                border: nodeType === nt.id ? `2px solid ${nt.color}` : '1px solid transparent',
                background: nodeType === nt.id ? `${nt.color}25` : 'transparent',
                color: nodeType === nt.id ? nt.color : '#9ca3af',
                cursor: 'pointer',
                fontSize: '0.68rem',
                fontWeight: nodeType === nt.id ? 600 : 400,
                textAlign: 'left',
                fontFamily: 'inherit',
                transition: 'all 0.15s',
              }}
            >
              {nt.label}
            </button>
          ))}
        </div>
      )}

      <div className="h-px bg-white/10 my-1" />

      {/* Grid & Snap Controls */}
      <div className="flex flex-col gap-1.5 pt-1 border-t border-white/10">
        {/* Grid Visibility Toggle */}
        <div className="flex items-center gap-1">
          <button
            onClick={onToggleGrid}
            className={`p-2.5 rounded-xl transition-all group relative flex-1 flex justify-center items-center ${
              gridVisible
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                : 'text-gray-500 hover:bg-white/5 hover:text-gray-400'
            }`}
            title={`Toggle Grid (${gridVisible ? 'ON' : 'OFF'})`}
          >
            <Grid3X3 size={16} />
            <span className="absolute left-full ml-4 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none transition-opacity z-50">
              Grid ({gridVisible ? 'Visible' : 'Hidden'})
            </span>
          </button>

          {/* Snap to Grid Toggle */}
          <button
            onClick={onToggleSnap}
            className={`p-2.5 rounded-xl transition-all group relative flex-1 flex justify-center items-center ${
              snapEnabled
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                : 'text-gray-500 hover:bg-white/5 hover:text-gray-400'
            }`}
            title={`Snap to Grid (${snapEnabled ? 'ON' : 'OFF'})`}
          >
            <Magnet size={16} />
            <span className="absolute left-full ml-4 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none transition-opacity z-50">
              Snap to Grid ({snapEnabled ? 'Enabled' : 'Disabled'})
            </span>
          </button>
        </div>

        {/* Grid Size selector (if grid or snap enabled) */}
        {(gridVisible || snapEnabled) && (
          <div className="flex gap-1 justify-between bg-white/5 p-1 rounded-lg">
            {GRID_SIZES.map((size) => (
              <button
                key={size}
                onClick={() => onChangeGridSize(size)}
                className={`text-[0.65rem] px-1.5 py-0.5 rounded transition-all font-medium ${
                  gridSize === size
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
                title={`${size}px grid`}
              >
                {size}px
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="h-px bg-white/10 my-1" />

      {/* Blueprint Upload */}
      <button
        onClick={onUploadPlan}
        className="p-3 rounded-xl text-gray-400 hover:bg-white/10 hover:text-white transition-all duration-200 group relative flex justify-center items-center"
      >
        <ImageIcon size={18} />
        <span className="absolute left-full ml-4 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none transition-opacity z-50">
          Blueprint Image
        </span>
      </button>

      {/* Save Button with Unsaved Indicator */}
      <button
        onClick={onSave}
        className={`p-3 rounded-xl transition-all duration-200 group relative flex justify-center items-center ${
          hasUnsavedChanges
            ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500 hover:text-white border border-amber-500/40'
            : 'bg-green-500/20 text-green-400 hover:bg-green-500 hover:text-white'
        }`}
      >
        <Save size={18} />
        {hasUnsavedChanges && (
          <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
        )}
        <span className="absolute left-full ml-4 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none transition-opacity z-50">
          {hasUnsavedChanges ? 'Save Changes (Unsaved edits)' : 'Save Changes'}
        </span>
      </button>
    </div>
  );
}
