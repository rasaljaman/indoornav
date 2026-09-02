import { useEffect, useRef, useState } from 'react';
import { Html5QrcodeScanner, Html5QrcodeScanType } from 'html5-qrcode';
import { X } from 'lucide-react';

export default function QRScanner({ onScanSuccess, onClose }) {
  const scannerRef = useRef(null);
  const [error, setError] = useState('');

  useEffect(() => {
    // Initialize Scanner
    const scanner = new Html5QrcodeScanner(
      "reader",
      { 
        fps: 10, 
        qrbox: { width: 250, height: 250 },
        supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
        rememberLastUsedCamera: true,
      },
      false
    );

    scannerRef.current = scanner;

    scanner.render(
      (decodedText) => {
        // Stop scanning after a successful scan
        if (scannerRef.current) {
          scannerRef.current.clear();
        }
        onScanSuccess(decodedText);
      },
      (err) => {
        // Ignoring scan errors, as they fire continuously when no QR is in frame
      }
    );

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(e => console.error("Failed to clear scanner", e));
      }
    };
  }, [onScanSuccess]);

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center">
      <button 
        onClick={onClose}
        className="absolute top-6 right-6 text-white hover:text-gray-300 p-2 bg-white/10 rounded-full"
      >
        <X size={24} />
      </button>

      <div className="w-full max-w-md p-4">
        <h2 className="text-white text-center text-xl font-semibold mb-4">
          Scan Location Anchor
        </h2>
        <div className="bg-white rounded-xl overflow-hidden shadow-2xl">
          <div id="reader" className="w-full"></div>
        </div>
        <p className="text-gray-400 text-center mt-6 text-sm">
          Point your camera at an IndoorNav QR code on the wall to locate yourself.
        </p>
      </div>

      <style>{`
        #reader { border: none !important; }
        #reader__dashboard_section_csr span { color: #333 !important; }
        #reader__dashboard_section_swaplink { color: #3B82F6 !important; text-decoration: none; }
        #reader button {
          background: #3B82F6;
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 6px;
          cursor: pointer;
          margin: 10px 0;
        }
      `}</style>
    </div>
  );
}
