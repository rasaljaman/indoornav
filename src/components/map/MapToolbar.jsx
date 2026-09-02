import { MousePointer2, Square, Circle, TrendingUp, Scaling, Save, Image as ImageIcon, QrCode } from 'lucide-react';

export default function MapToolbar({ currentTool, setTool, onSave, onUploadPlan }) {
  const tools = [
    { id: 'select', icon: MousePointer2, label: 'Select' },
    { id: 'room', icon: Square, label: 'Draw Room' },
    { id: 'node', icon: Circle, label: 'Add Node' },
    { id: 'edge', icon: TrendingUp, label: 'Draw Path' },
    { id: 'scale', icon: Scaling, label: 'Calibrate Scale' },
    { id: 'qr', icon: QrCode, label: 'Assign QR Anchor' },
  ];

  return (
    <div className="absolute left-4 top-24 bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-2 flex flex-col gap-2 shadow-2xl z-10">
      {tools.map(({ id, icon: Icon, label }) => (
        <button
          key={id}
          onClick={() => setTool(id)}
          className={`p-3 rounded-xl transition-all duration-200 group relative ${
            currentTool === id 
              ? 'bg-blue-500 text-white shadow-[0_0_15px_rgba(59,130,246,0.5)]' 
              : 'text-gray-400 hover:bg-white/10 hover:text-white'
          }`}
          title={label}
        >
          <Icon size={20} />
          <span className="absolute left-full ml-4 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none transition-opacity">
            {label}
          </span>
        </button>
      ))}

      <div className="h-px bg-white/10 my-2" />

      <button
        onClick={onUploadPlan}
        className="p-3 rounded-xl text-gray-400 hover:bg-white/10 hover:text-white transition-all duration-200 group relative"
      >
        <ImageIcon size={20} />
        <span className="absolute left-full ml-4 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none transition-opacity">
          Upload Blueprint
        </span>
      </button>

      <button
        onClick={onSave}
        className="p-3 rounded-xl bg-green-500/20 text-green-400 hover:bg-green-500 hover:text-white transition-all duration-200 group relative"
      >
        <Save size={20} />
        <span className="absolute left-full ml-4 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none transition-opacity">
          Save Changes
        </span>
      </button>
    </div>
  );
}
