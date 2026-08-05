import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { AlertCircle, Loader2 } from 'lucide-react';

interface QrScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onScanFailure?: (error: any) => void;
  active?: boolean;
}

// Decode a QR code from an uploaded image file. html5-qrcode needs a real DOM
// container, so we mount a throwaway hidden one and remove it afterwards.
export const decodeQrFromFile = async (file: File): Promise<string> => {
  const container = document.createElement('div');
  container.id = `qr-file-reader-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  // Positioned off-screen rather than `display: none`: html5-qrcode sizes its
  // decode canvas from the container's clientWidth/clientHeight, and a hidden
  // element reports 0 — which silently downsamples uploads to 300x300 and makes
  // high-resolution phone photos undecodable.
  container.style.position = 'fixed';
  container.style.left = '-10000px';
  container.style.top = '0';
  container.style.width = '1500px';
  container.style.height = '1500px';
  container.style.opacity = '0';
  container.style.pointerEvents = 'none';
  document.body.appendChild(container);

  const fileScanner = new Html5Qrcode(container.id, {
    experimentalFeatures: { useBarCodeDetectorIfSupported: true },
    verbose: false,
  } as any);

  try {
    return await fileScanner.scanFile(file, false);
  } finally {
    try {
      fileScanner.clear();
    } catch {}
    container.remove();
  }
};

const QrScanner: React.FC<QrScannerProps> = ({ onScanSuccess, onScanFailure, active = true }) => {
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

  // Stop camera when active becomes false (e.g., modal closed)
  useEffect(() => {
    if (!active && scannerRef.current) {
      isStoppedRef.current = true;
      try {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current.clear();
      } catch {}
      scannerRef.current = null;
      setError(null);
      setIsInitializing(false);
    }
  }, [active]);

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
            // qrbox is measured in CSS pixels and also sizes the decode canvas,
            // so a small box literally means fewer pixels per QR module. Keep it
            // as large as the viewfinder allows — it must never exceed the
            // viewfinder or getShadedRegionBounds throws.
            qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
              const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
              const size = Math.min(minEdge, Math.max(150, Math.floor(minEdge * 0.9)));
              return { width: size, height: size };
            },
            videoConstraints: {
              facingMode: "environment",
              // @ts-ignore - focusMode is a hint; browsers that don't support it ignore it
              focusMode: "continuous",
              // Only ideals: `min` is a hard constraint and makes getUserMedia
              // throw OverconstrainedError on devices that can't hit it. A
              // higher-resolution source also downsamples more cleanly into the
              // decode canvas.
              width: { ideal: 1920 },
              height: { ideal: 1080 }
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
    <div className="w-full mx-auto">
      <div className="relative w-full min-h-[18rem] overflow-hidden rounded-xl shadow-sm border border-[#E0DDD4] bg-black">
        {isInitializing && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#111110]/90 z-20 text-white">
            <Loader2 className="w-8 h-8 text-[#8B82F0] animate-spin mb-3" />
            <p className="text-sm font-medium">Starting camera...</p>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#F5F3EE] z-20 p-6 text-center">
            <AlertCircle className="w-10 h-10 text-red-500 mb-3" />
            <p className="text-sm text-[#4A4843]">{error}</p>
          </div>
        )}

        {/*
          The video must keep its natural aspect ratio. html5-qrcode maps the
          scan box to source pixels using videoWidth/clientWidth and
          videoHeight/clientHeight independently, which is only correct when the
          video is not letterboxed or cropped. `object-cover` broke that
          assumption and handed the decoder a horizontally squashed QR.
        */}
        <div id="qr-reader" className="relative w-full [&_video]:w-full [&_video]:h-auto [&_video]:block"></div>
      </div>
    </div>
  );
};

export default QrScanner;
