import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { AlertCircle, Loader2, Camera } from 'lucide-react';

interface QrScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onScanFailure?: (error: any) => void;
}

interface CameraDevice {
  id: string;
  label: string;
}

// Prefer a rear/environment camera when present (phones/tablets); otherwise
// fall back to the only available device, which on a laptop is the webcam.
const pickDefaultCamera = (cameras: CameraDevice[]): string | null => {
  if (cameras.length === 0) return null;
  const rear = cameras.find((c) => /back|rear|environment/i.test(c.label));
  if (rear) return rear.id;
  return cameras[cameras.length - 1].id;
};

const QrScanner: React.FC<QrScannerProps> = ({ onScanSuccess, onScanFailure }) => {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isStoppedRef = useRef(false);
  const onSuccessRef = useRef(onScanSuccess);
  const onFailureRef = useRef(onScanFailure);

  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  // Keep latest callbacks without restarting the camera on every render.
  useEffect(() => {
    onSuccessRef.current = onScanSuccess;
    onFailureRef.current = onScanFailure;
  }, [onScanSuccess, onScanFailure]);

  // Enumerate cameras once, after permission is granted.
  useEffect(() => {
    let cancelled = false;

    Html5Qrcode.getCameras()
      .then((devices) => {
        if (cancelled) return;
        const mapped = devices.map((d) => ({ id: d.id, label: d.label || 'Camera' }));
        setCameras(mapped);
        setSelectedCameraId((prev) => prev ?? pickDefaultCamera(mapped));
        if (mapped.length === 0) {
          setError('No camera was found on this device.');
          setIsInitializing(false);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Failed to enumerate cameras:', err);
        setError('Could not access a camera. Please ensure you have granted camera permissions.');
        setIsInitializing(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Start (and restart on camera change) the scanner.
  useEffect(() => {
    if (!selectedCameraId) return;

    setIsInitializing(true);
    setError(null);
    isStoppedRef.current = false;

    // Use the native BarcodeDetector when the browser supports it — it is
    // markedly faster and more accurate than the JS fallback decoder.
    const scanner = new Html5Qrcode('qr-reader', {
      experimentalFeatures: { useBarCodeDetectorIfSupported: true },
      verbose: false,
    } as any);
    scannerRef.current = scanner;

    const handleSuccess = (decodedText: string) => {
      if (isStoppedRef.current) return;
      isStoppedRef.current = true;

      const finish = () => onSuccessRef.current(decodedText);
      try {
        scanner.stop().then(finish).catch((err) => {
          console.error(err);
          finish();
        });
      } catch (err) {
        console.error(err);
        finish();
      }
    };

    const startScanner = async () => {
      try {
        await scanner.start(
          // Request the chosen device at a high resolution so small/dense QR
          // codes have enough pixels to decode on fixed-focus webcams.
          {
            deviceId: { exact: selectedCameraId },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          {
            fps: 15,
            // Scale the scan box to the viewport so the code can sit anywhere
            // reasonably centered rather than within a fixed 250px window.
            qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
              const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
              const size = Math.max(150, Math.floor(minEdge * 0.7));
              return { width: size, height: size };
            },
          },
          handleSuccess,
          (errorMessage) => {
            if (onFailureRef.current && !isStoppedRef.current) {
              onFailureRef.current(errorMessage);
            }
          }
        );
        setIsInitializing(false);
      } catch (err) {
        console.error('Failed to start scanner:', err);
        setError('Could not start the selected camera. Please check permissions or pick another camera.');
        setIsInitializing(false);
      }
    };

    startScanner();

    return () => {
      isStoppedRef.current = true;
      const current = scannerRef.current;
      if (current) {
        try {
          current.stop().catch(() => {
            // Ignore errors on unmount/restart stop.
          });
        } catch {
          // Ignore synchronous errors.
        }
      }
    };
  }, [selectedCameraId]);

  return (
    <div className="w-full max-w-sm mx-auto space-y-2">
      <div className="relative w-full overflow-hidden rounded-xl shadow-sm border border-slate-200 bg-black min-h-[300px]">
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

        {/* object-contain keeps the whole frame visible to the decoder so the
            QR code is never cropped out of the scanned region. */}
        <div id="qr-reader" className="w-full h-full [&>video]:object-contain"></div>
      </div>

      {cameras.length > 1 && (
        <label className="flex items-center gap-2 text-xs font-medium text-slate-500">
          <Camera size={14} className="shrink-0" />
          <select
            value={selectedCameraId ?? ''}
            onChange={(e) => setSelectedCameraId(e.target.value)}
            className="flex-1 min-w-0 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
          >
            {cameras.map((cam) => (
              <option key={cam.id} value={cam.id}>
                {cam.label}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
};

export default QrScanner;
