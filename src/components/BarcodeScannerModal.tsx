import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw, Zap, ZapOff } from 'lucide-react';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (barcode: string) => void;
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  onScanSuccess,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [torchOn, setTorchOn] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [cameraError, setCameraError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let stream: MediaStream | null = null;
    let animId: number | null = null;
    let active = true;

    async function startCamera() {
      setCameraError(null);
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        // Use native BarcodeDetector API if supported in Chromium/Android WebView
        const Win = window as unknown as {
          BarcodeDetector?: new (opts: { formats: string[] }) => {
            detect: (el: HTMLVideoElement) => Promise<{ rawValue: string }[]>;
          };
        };

        if (Win.BarcodeDetector) {
          const detector = new Win.BarcodeDetector({
            formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'qr_code'],
          });
          const loop = async () => {
            if (!active || !videoRef.current) return;
            try {
              if (videoRef.current.readyState >= 2) {
                const results = await detector.detect(videoRef.current);
                if (results && results.length > 0 && results[0].rawValue) {
                  onScanSuccess(results[0].rawValue);
                  onClose();
                  return;
                }
              }
            } catch {
              // ignore frame detection error
            }
            animId = requestAnimationFrame(loop);
          };
          animId = requestAnimationFrame(loop);
        }
      } catch (err) {
        console.warn('Camera access error:', err);
        setCameraError('Camera access unavailable or denied. Enter barcode below.');
      }
    }

    startCamera();

    return () => {
      active = false;
      if (animId) cancelAnimationFrame(animId);
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [isOpen, facingMode, onClose, onScanSuccess]);

  const toggleTorch = async () => {
    const next = !torchOn;
    setTorchOn(next);
    try {
      const stream = videoRef.current?.srcObject as MediaStream | null;
      const track = stream?.getVideoTracks()[0];
      if (track && 'applyConstraints' in track) {
        await track.applyConstraints({
          advanced: [{ torch: next } as MediaTrackConstraintSet],
        });
      }
    } catch {
      // Torch not supported on this device
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col justify-between">
      {/* Live Camera Video */}
      <video
        ref={videoRef}
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover opacity-80"
      />

      {/* Top manual entry fallback bar for desktop testing */}
      <div className="relative z-10 pt-10 px-4 flex items-center gap-2">
        <input
          type="text"
          value={manualCode}
          onChange={(e) => setManualCode(e.target.value)}
          placeholder="Type barcode or scan with camera..."
          className="flex-1 bg-black/70 border border-white/25 text-white text-sm rounded-xl px-3.5 py-2.5 outline-none focus:border-white"
        />
        {manualCode.trim() && (
          <button
            type="button"
            onClick={() => {
              onScanSuccess(manualCode.trim());
              setManualCode('');
              onClose();
            }}
            className="bg-emerald-600 text-white text-xs font-semibold px-4 py-2.5 rounded-xl"
          >
            Use Code
          </button>
        )}
      </div>

      {/* Center Viewfinder Window with Red Laser Line (Matches 08:20 & 08:54) */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm h-48 relative border border-white/20 bg-white/5 overflow-hidden">
          <div className="absolute left-2 right-2 h-0.5 bg-red-500 shadow-[0_0_8px_#ef4444] animate-laser" />
        </div>
        {cameraError && (
          <p className="text-xs text-amber-300 mt-3 bg-black/70 px-3 py-1.5 rounded-lg text-center">
            {cameraError}
          </p>
        )}
      </div>

      {/* Bottom Action Bar: Flip Camera (left), Flash Toggle (center), Cancel (right) */}
      <div className="relative z-10 pb-8 pt-4 px-6 bg-gradient-to-t from-black via-black/80 to-transparent flex items-center justify-between">
        <button
          type="button"
          onClick={() => setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))}
          className="w-11 h-11 rounded-full bg-white text-slate-900 flex items-center justify-center active:scale-95 transition-transform"
          title="Flip Camera"
        >
          <RefreshCw className="w-5 h-5" />
        </button>

        <button
          type="button"
          onClick={toggleTorch}
          className="w-12 h-12 rounded-full text-white flex items-center justify-center active:scale-95 transition-transform"
          title="Toggle Flash"
        >
          {torchOn ? <Zap className="w-7 h-7 text-yellow-400" /> : <ZapOff className="w-7 h-7 text-white" />}
        </button>

        <button
          type="button"
          onClick={onClose}
          className="text-white font-semibold text-sm px-3 py-2 active:opacity-75"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};
