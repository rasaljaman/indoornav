import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowLeft, Printer, Loader2 } from 'lucide-react';

export default function QRPrintLayout() {
  const { buildingId, floorId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [qrPoints, setQrPoints] = useState([]);
  const [floorName, setFloorName] = useState('');

  useEffect(() => {
    async function loadData() {
      try {
        const { data: floor } = await supabase
          .from('floors')
          .select('name')
          .eq('id', floorId)
          .single();
        if (floor) setFloorName(floor.name);

        // Fetch nodes for this floor that have QRs
        const { data: nodes } = await supabase
          .from('nodes')
          .select('id')
          .eq('floor_id', floorId);
        
        if (nodes && nodes.length > 0) {
          const nodeIds = nodes.map(n => n.id);
          const { data: qrs } = await supabase
            .from('qr_points')
            .select('*')
            .in('node_id', nodeIds);
          if (qrs) setQrPoints(qrs);
        }
      } catch (err) {
        console.error('Error loading QR points:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [floorId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-white text-black min-h-screen">
      {/* Non-printable header */}
      <div className="print:hidden p-4 border-b flex justify-between items-center bg-[#0a0a0f] text-white">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 hover:text-gray-300">
          <ArrowLeft size={20} /> Back
        </button>
        <h1 className="font-semibold text-lg">Print QR Anchors - {floorName}</h1>
        <button 
          onClick={() => window.print()}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg"
        >
          <Printer size={20} /> Print (A4)
        </button>
      </div>

      {/* Printable Grid */}
      <div className="p-8 print:p-0">
        <div className="grid grid-cols-2 md:grid-cols-3 print:grid-cols-3 gap-8 print:gap-4 max-w-5xl mx-auto">
          {qrPoints.map((qr, index) => (
            <div key={qr.id} className="border-2 border-dashed border-gray-300 p-6 flex flex-col items-center justify-center rounded-xl text-center page-break-inside-avoid">
              <h2 className="text-xl font-bold mb-4 font-sans text-gray-800">IndoorNav Anchor</h2>
              <div className="bg-white p-2 rounded shadow-sm">
                <QRCodeSVG 
                  value={qr.qr_code_value} 
                  size={150}
                  level="H"
                  includeMargin={true}
                />
              </div>
              <p className="mt-4 text-sm text-gray-500 font-mono break-all max-w-[200px]">
                {qr.node_id.substring(0, 8)}
              </p>
              <p className="text-xs text-gray-400 mt-2">Scan to pinpoint your location</p>
            </div>
          ))}
          {qrPoints.length === 0 && (
            <div className="col-span-full text-center text-gray-500 py-12">
              No QR codes assigned for this floor yet. Add them in the Map Editor!
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
