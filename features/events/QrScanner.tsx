import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { AlertCircle, Loader2 } from 'lucide-react';

interface QrScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onScanFailure?: (error: any) => void;
}

const QrScanner: React.FC<QrScannerProps> = ({ onScanSuccess, onScanFailure }) => {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    const scanner = new Html5Qrcode("qr-reader");
    scannerRef.current = scanner;

    const startScanner = async () => {
      try {
        await scanner.start(
          { facingMode: "environment" }, // Forces the rear camera
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
          },
          (decodedText) => {
            // Stop scanning once we get a success to prevent multiple triggers
            if (scannerRef.current) {
              scannerRef.current.stop().then(() => {
                onScanSuccess(decodedText);
              }).catch(console.error);
            } else {
              onScanSuccess(decodedText);
            }
          },
          (errorMessage) => {
            if (onScanFailure) {
              onScanFailure(errorMessage);
            }
          }
        );
        setIsInitializing(false);
      } catch (err) {
        console.error("Failed to start scanner:", err);
        setError("Could not access the rear camera. Please ensure you have granted camera permissions.");
        setIsInitializing(false);
      }
    };

    startScanner();

    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch((e) => {
          // Ignore errors on unmount stop
        });
      }
    };
  }, [onScanSuccess, onScanFailure]);

  return (
    <div className="relative w-full max-w-sm mx-auto overflow-hidden rounded-xl shadow-sm border border-slate-200 bg-black min-h-[300px]">
      {isInitializing && !error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/90 z-10 text-white">
          <Loader2 className="w-8 h-8 text-indigo-400 animate-spin mb-3" />
          <p className="text-sm font-medium">Starting camera...</p>
        </div>
      )}
      
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50 z-10 p-6 text-center">
          <AlertCircle className="w-10 h-10 text-red-500 mb-3" />
          <p className="text-sm text-slate-700">{error}</p>
        </div>
      )}
      
      <div id="qr-reader" className="w-full h-full [&>video]:object-cover"></div>
    </div>
  );
};

export default QrScanner;
