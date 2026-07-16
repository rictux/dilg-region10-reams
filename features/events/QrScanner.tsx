import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { AlertCircle, Loader2 } from 'lucide-react';

interface QrScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onScanFailure?: (error: any) => void;
}

const QrScanner: React.FC<QrScannerProps> = ({ onScanSuccess, onScanFailure }) => {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isStoppedRef = useRef(false);
  const onSuccessRef = useRef(onScanSuccess);
  const onFailureRef = useRef(onScanFailure);

  const [error, setError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  // Keep latest callbacks without restarting the camera on every render.
  useEffect(() => {
    onSuccessRef.current = onScanSuccess;
    onFailureRef.current = onScanFailure;
  }, [onScanSuccess, onScanFailure]);

  // Start the scanner with rear camera.
  useEffect(() => {
    let isMounted = true;
    let scanner: Html5Qrcode | null = null;

    const initScanner = async () => {
      // Clean up any existing scanner first
      if (scannerRef.current) {
        try {
          if (scannerRef.current.isScanning) {
            await scannerRef.current.stop();
          }
          scannerRef.current.clear();
        } catch (e) {
          console.error('Cleanup error:', e);
        }
        scannerRef.current = null;
      }

      // Clear the qr-reader div
      const readerDiv = document.getElementById('qr-reader');
      if (readerDiv) {
        readerDiv.innerHTML = '';
      }

      if (!isMounted) return;

      setIsInitializing(true);
      setError(null);
      isStoppedRef.current = false;

      try {
        scanner = new Html5Qrcode('qr-reader', {
          experimentalFeatures: { useBarCodeDetectorIfSupported: true },
          verbose: false,
        } as any);
        scannerRef.current = scanner;

        const handleSuccess = (decodedText: string) => {
          if (isStoppedRef.current) return;
          isStoppedRef.current = true;

          const finish = () => onSuccessRef.current(decodedText);
          try {
            scanner!.stop().then(finish).catch((err) => {
              console.error(err);
              finish();
            });
          } catch (err) {
            console.error(err);
            finish();
          }
        };

        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 20,
            qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
              const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
              const size = Math.max(150, Math.floor(minEdge * 0.7));
              return { width: size, height: size };
            },
            videoConstraints: {
              facingMode: "environment",
              // @ts-ignore - focusMode is supported in many browsers even if not in standard TS types
              focusMode: "continuous",
              width: { min: 640, ideal: 1280, max: 1920 },
              height: { min: 480, ideal: 720, max: 1080 }
            }
          },
          handleSuccess,
          (errorMessage) => {
            if (onFailureRef.current && !isStoppedRef.current) {
              onFailureRef.current(errorMessage);
            }
          }
        );

        if (isMounted) {
          setIsInitializing(false);
        }
      } catch (err) {
        console.error('Failed to start scanner:', err);
        if (isMounted) {
          setError('Could not start the camera. Please check that camera permissions are granted.');
          setIsInitializing(false);
        }
      }
    };

    initScanner();

    return () => {
      isMounted = false;
      isStoppedRef.current = true;
      if (scannerRef.current) {
        try {
          scannerRef.current.stop().catch(() => {});
          scannerRef.current.clear();
        } catch {}
      }
      scannerRef.current = null;
    };
  }, []);

  return (
    <div className="w-full max-w-sm mx-auto">
      <div className="relative w-full overflow-hidden rounded-xl shadow-sm border border-[#E0DDD4] bg-black min-h-[300px]">
        {isInitializing && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#111110]/90 z-10 text-white">
            <Loader2 className="w-8 h-8 text-[#8B82F0] animate-spin mb-3" />
            <p className="text-sm font-medium">Starting camera...</p>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#F5F3EE] z-10 p-6 text-center">
            <AlertCircle className="w-10 h-10 text-red-500 mb-3" />
            <p className="text-sm text-[#4A4843]">{error}</p>
          </div>
        )}

        <div id="qr-reader" className="w-full h-full [&>video]:object-contain"></div>
      </div>
    </div>
  );
};

export default QrScanner;
