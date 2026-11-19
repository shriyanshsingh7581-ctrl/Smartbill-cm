import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  ImagePlus,
  Loader2,
  RefreshCw,
  ScanLine,
  Zap,
  ZapOff,
  ZoomIn,
} from 'lucide-react';
import {
  createSafeNativeBarcodeDetector,
  decodeBarcodesFromCanvas,
  decodeBarcodesFromImageFile,
  decodeImageDataWithZxingWasm,
  isValidImeiLuhn,
  normalizeScannedCode,
  warmupZxingWasm,
  type ScannedVisionResult,
} from '../services/integrations';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (barcode: string, visionResult?: ScannedVisionResult) => void;
  scanMode?: 'barcode_or_imei' | 'bill_items';
  title?: string;
}

// Crisp POS scanner beep + mobile haptic vibration
function playScanFeedback() {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(70);
    }
  } catch {
    // ignore vibration errors
  }
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1950, ctx.currentTime);
    gain.gain.setValueAtTime(0.16, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
    setTimeout(() => {
      void ctx.close().catch(() => {});
    }, 180);
  } catch {
    // Audio playback blocked without gesture
  }
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  onScanSuccess,
  title,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const onScanRef = useRef(onScanSuccess);
  const onCloseRef = useRef(onClose);
  const scanLockedRef = useRef(false);

  onScanRef.current = onScanSuccess;
  onCloseRef.current = onClose;

  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [retryCounter, setRetryCounter] = useState(0);
  const [torchOn, setTorchOn] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [maxZoom, setMaxZoom] = useState<number>(1);
  const [manualCode, setManualCode] = useState('');
  const [cameraState, setCameraState] = useState<'starting' | 'live' | 'unavailable'>('starting');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [detectedFlashCode, setDetectedFlashCode] = useState<string | null>(null);
  const [photoDecoding, setPhotoDecoding] = useState(false);
  const [scanHint, setScanHint] = useState<string | null>(null);

  const emitCodeDirectly = (rawCode: string) => {
    const clean = normalizeScannedCode(rawCode);
    if (!clean || scanLockedRef.current) return;
    scanLockedRef.current = true;
    playScanFeedback();
    setDetectedFlashCode(clean);

    const isImei = /^\d{15}$/.test(clean);
    window.setTimeout(() => {
      onScanRef.current(clean, {
        code: clean,
        codeType: isImei ? 'imei' : 'barcode',
      });
      setDetectedFlashCode(null);
      setManualCode('');
      onCloseRef.current();
    }, 220);
  };

  // Pure local photo barcode/IMEI decode (ZERO AI) for fallback or gallery images
  const processLocalPhotoFile = async (file: File) => {
    setScanHint(null);
    setPhotoDecoding(true);
    try {
      const localRes = await decodeBarcodesFromImageFile(file);
      if (localRes.primary) {
        setPhotoDecoding(false);
        emitCodeDirectly(localRes.primary);
        return;
      }
      setPhotoDecoding(false);
      setScanHint('Photo mein barcode/IMEI clear nahi mila. Live camera ko barcode ke paas rakhein.');
    } catch {
      setPhotoDecoding(false);
      setScanHint('Photo decode nahi hui. Live camera ya clear photo try karein.');
    }
  };

  useEffect(() => {
    if (!isOpen) {
      scanLockedRef.current = false;
      setCameraState('starting');
      setCameraError(null);
      setDetectedFlashCode(null);
      setPhotoDecoding(false);
      setScanHint(null);
      setZoomLevel(1);
      setMaxZoom(1);
      setTorchOn(false);
      return;
    }

    scanLockedRef.current = false;
    setCameraState('starting');
    setCameraError(null);
    setDetectedFlashCode(null);
    setScanHint(null);

    let stream: MediaStream | null = null;
    let scanTimerId: number | null = null;
    let active = true;
    let tickCount = 0;

    // Preload local C++ ZXing-WASM immediately in parallel with camera open
    void warmupZxingWasm();

    async function acquireStream(): Promise<MediaStream> {
      const attempts: MediaStreamConstraints[] = [
        {
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1920, min: 640 },
            height: { ideal: 1080, min: 480 },
          },
          audio: false,
        },
        {
          video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        },
        { video: { facingMode }, audio: false },
        { video: true, audio: false },
      ];
      let lastErr: unknown;
      for (const constraints of attempts) {
        try {
          return await navigator.mediaDevices.getUserMedia(constraints);
        } catch (e) {
          lastErr = e;
        }
      }
      throw lastErr || new Error('Camera unavailable');
    }

    async function startAutoScanner() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (active) {
          setCameraState('unavailable');
          setCameraError('Live camera browser mein available nahi hai.');
        }
        return;
      }

      try {
        stream = await acquireStream();

        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        // Enable continuous autofocus + detect optical/digital zoom for small IMEI barcodes
        const track = stream.getVideoTracks()[0];
        if (track && typeof track.getCapabilities === 'function') {
          try {
            const caps = track.getCapabilities() as Record<string, unknown>;
            if (caps) {
              const focusModes = Array.isArray(caps.focusMode) ? (caps.focusMode as string[]) : [];
              if (focusModes.includes('continuous')) {
                await track.applyConstraints({
                  advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet],
                });
              }
              const zoomCap = caps.zoom as { min?: number; max?: number } | undefined;
              if (zoomCap && typeof zoomCap.max === 'number' && zoomCap.max > 1.2) {
                setMaxZoom(Math.min(zoomCap.max, 4));
              }
            }
          } catch {
            // Focus/zoom optional
          }
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        if (!active) return;
        setCameraState('live');

        // Prepare pure-local real-time decoders:
        // 1. ZXing-C++ WebAssembly (primary — handles 1D Code-128 IMEI, EAN-13, UPC, Code-39, ITF, QR at C++ speed)
        // 2. Native Browser BarcodeDetector (hardware accelerated when supported)
        // 3. Pure-JS @zxing/library fallback (only if WASM is unavailable)
        const [wasmReady, nativeDetector] = await Promise.all([
          warmupZxingWasm(),
          createSafeNativeBarcodeDetector(),
        ]);

        const scanCanvas = document.createElement('canvas');
        const scanCtx = scanCanvas.getContext('2d', { willReadFrequently: true });

        const runAutoScanTick = async () => {
          if (!active || scanLockedRef.current) return;
          const video = videoRef.current;
          if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
            scanTimerId = window.setTimeout(() => void runAutoScanTick(), 100);
            return;
          }

          tickCount += 1;

          // Step 1: Native BarcodeDetector pass (instant hardware decode if available)
          if (nativeDetector && !scanLockedRef.current) {
            try {
              const detected = await nativeDetector.detect(video);
              if (detected && detected.length > 0 && !scanLockedRef.current) {
                // Prefer valid 15-digit IMEI or first valid barcode
                const codes = detected
                  .map((d) => normalizeScannedCode(d.rawValue || ''))
                  .filter((c) => c.length >= 4);
                if (codes.length > 0) {
                  const imeiCode = codes.find((c) => /^\d{15}$/.test(c) && isValidImeiLuhn(c));
                  emitCodeDirectly(imeiCode || codes[0]);
                  return;
                }
              }
            } catch {
              // ignore frame error
            }
          }

          // Step 2: Native-resolution ROI crop -> ZXing-C++ WebAssembly (NO downscaling of center laser box!)
          if (scanCtx && !scanLockedRef.current) {
            try {
              const vw = video.videoWidth;
              const vh = video.videoHeight;

              // Ticks 1, 2: Sharp center horizontal laser-box strip at FULL native resolution
              // Tick 3: Wider full-frame scan (catches barcodes held slightly outside center)
              const isCenterBox = tickCount % 3 !== 0;
              const sx = isCenterBox ? Math.floor(vw * 0.05) : 0;
              const sy = isCenterBox ? Math.floor(vh * 0.27) : Math.floor(vh * 0.08);
              const sw = isCenterBox ? Math.floor(vw * 0.9) : vw;
              const sh = isCenterBox ? Math.floor(vh * 0.46) : Math.floor(vh * 0.84);

              // Keep center strip crisp up to 1400px wide so narrow Code-128 IMEI bars never blur
              const maxW = isCenterBox ? 1400 : 1100;
              const scale = Math.min(1, maxW / Math.max(1, sw));
              const cw = Math.max(64, Math.round(sw * scale));
              const ch = Math.max(64, Math.round(sh * scale));

              if (scanCanvas.width !== cw || scanCanvas.height !== ch) {
                scanCanvas.width = cw;
                scanCanvas.height = ch;
              }
              scanCtx.drawImage(video, sx, sy, sw, sh, 0, 0, cw, ch);

              if (wasmReady) {
                const imgData = scanCtx.getImageData(0, 0, cw, ch);
                const symbols = await decodeImageDataWithZxingWasm(imgData);
                if (symbols.length > 0 && !scanLockedRef.current) {
                  emitCodeDirectly(symbols[0].text);
                  return;
                }
              } else {
                // Pure-JS ZXing fallback only when WebAssembly is blocked
                const jsCodes = decodeBarcodesFromCanvas(scanCanvas, {
                  tryRotated: tickCount % 4 === 0,
                  tryInverted: false,
                  scanSlices: false,
                });
                if (jsCodes.length > 0 && !scanLockedRef.current) {
                  emitCodeDirectly(jsCodes[0]);
                  return;
                }
              }
            } catch {
              // continue scanning next frame
            }
          }

          if (active && !scanLockedRef.current) {
            scanTimerId = window.setTimeout(() => void runAutoScanTick(), 95);
          }
        };

        scanTimerId = window.setTimeout(() => void runAutoScanTick(), 120);
      } catch (err) {
        if (!active) return;
        const msg =
          err instanceof Error && err.name === 'NotAllowedError'
            ? 'Camera permission allow karein.'
            : 'Camera start nahi ho paya.';
        setCameraError(msg);
        setCameraState('unavailable');
      }
    }

    void startAutoScanner();

    return () => {
      active = false;
      if (scanTimerId) window.clearTimeout(scanTimerId);
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [isOpen, facingMode, retryCounter]);

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
      setTorchOn(false);
    }
  };

  const cycleZoom = async () => {
    const steps = maxZoom >= 2.4 ? [1, 1.6, 2.4] : maxZoom >= 1.5 ? [1, 1.5] : [1];
    const currentIdx = steps.findIndex((s) => Math.abs(s - zoomLevel) < 0.15);
    const nextZoom = Math.min(maxZoom, steps[(currentIdx + 1) % steps.length]);
    setZoomLevel(nextZoom);
    try {
      const stream = videoRef.current?.srcObject as MediaStream | null;
      const track = stream?.getVideoTracks()[0];
      if (track && 'applyConstraints' in track) {
        await track.applyConstraints({
          advanced: [{ zoom: nextZoom } as MediaTrackConstraintSet],
        });
      }
    } catch {
      // ignore unsupported zoom
    }
  };

  const submitManualCode = () => {
    const clean = normalizeScannedCode(manualCode);
    if (!clean) return;
    emitCodeDirectly(clean);
  };

  if (!isOpen) return null;

  const manualClean = normalizeScannedCode(manualCode);
  const manualIsValidImei = /^\d{15}$/.test(manualClean) && isValidImeiLuhn(manualClean);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col justify-between">
      {/* Hidden local photo/gallery fallback inputs (Pure local ZXing decode — ZERO AI) */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void processLocalPhotoFile(file);
        }}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void processLocalPhotoFile(file);
        }}
      />

      {/* Full-Screen Live Camera Video */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-200 ${
          cameraState === 'live' ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Top Header + Manual Entry Bar */}
      <div className="relative z-10 pt-7 px-4 pb-3 space-y-2 bg-gradient-to-b from-black/85 via-black/45 to-transparent">
        <div className="flex items-center justify-between text-white px-1">
          <span className="text-xs font-extrabold tracking-wide flex items-center gap-1.5">
            <ScanLine className="w-4 h-4 text-emerald-400" />
            {title || 'Barcode & IMEI Scanner'}
          </span>
          <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300">
            {cameraState === 'live' ? 'Auto Scan ON' : 'Starting...'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex-1 relative">
            <input
              type="text"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submitManualCode();
                }
              }}
              placeholder="Or type barcode / 15-digit IMEI..."
              className="w-full bg-black/75 border border-white/25 text-white text-sm rounded-xl px-3.5 py-2.5 outline-none focus:border-emerald-400 pr-16"
            />
            {manualIsValidImei && (
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-emerald-300 bg-emerald-500/20 px-1.5 py-0.5 rounded">
                IMEI ✓
              </span>
            )}
          </div>
          {manualCode.trim() && (
            <button
              type="button"
              onClick={submitManualCode}
              className="bg-emerald-500 text-[#0A2540] text-xs font-extrabold px-4 py-2.5 rounded-xl active:scale-95"
            >
              OK
            </button>
          )}
        </div>
      </div>

      {/* Center Auto-Scan Laser Viewfinder */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-5 gap-3">
        {photoDecoding ? (
          <div className="bg-black/85 border border-emerald-400/40 rounded-2xl p-6 max-w-xs w-full text-center space-y-2.5">
            <Loader2 className="w-9 h-9 text-emerald-400 animate-spin mx-auto" />
            <p className="text-sm font-bold text-white">Decoding Barcode / IMEI...</p>
          </div>
        ) : cameraState === 'live' ? (
          <>
            <div
              className={`w-full max-w-sm h-44 relative rounded-2xl border-2 overflow-hidden transition-colors duration-150 ${
                detectedFlashCode
                  ? 'border-emerald-400 bg-emerald-500/25 shadow-[0_0_25px_rgba(16,185,129,0.7)]'
                  : 'border-white/75 bg-black/5 shadow-lg'
              }`}
            >
              {/* 4 Corner Brackets */}
              <div className="absolute top-0 left-0 w-7 h-7 border-t-4 border-l-4 border-emerald-400 rounded-tl-xl" />
              <div className="absolute top-0 right-0 w-7 h-7 border-t-4 border-r-4 border-emerald-400 rounded-tr-xl" />
              <div className="absolute bottom-0 left-0 w-7 h-7 border-b-4 border-l-4 border-emerald-400 rounded-bl-xl" />
              <div className="absolute bottom-0 right-0 w-7 h-7 border-b-4 border-r-4 border-emerald-400 rounded-br-xl" />

              {detectedFlashCode ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 px-3 text-center">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 mb-1" />
                  <p className="text-base font-mono font-extrabold text-white tracking-wider break-all">
                    {detectedFlashCode}
                  </p>
                </div>
              ) : (
                <div className="absolute left-3 right-3 h-0.5 bg-red-500 shadow-[0_0_10px_#ef4444] animate-laser" />
              )}
            </div>

            <p className="text-xs font-semibold text-white bg-black/65 px-4 py-1.5 rounded-full text-center">
              {detectedFlashCode
                ? 'Scanned!'
                : 'Barcode ya IMEI ko box mein rakhein — apne aap scan hoga'}
            </p>
          </>
        ) : cameraState === 'starting' ? (
          <div className="bg-black/75 border border-white/15 rounded-2xl p-6 max-w-xs w-full text-center space-y-2.5">
            <Loader2 className="w-9 h-9 text-emerald-400 animate-spin mx-auto" />
            <p className="text-sm font-bold text-white">Camera chalu ho raha hai...</p>
            <p className="text-[11px] text-slate-300">Auto-scan ready in 1 second</p>
          </div>
        ) : (
          <div className="bg-[#0A2540] border border-white/15 rounded-3xl p-5 max-w-sm w-full text-center space-y-4 shadow-2xl">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 flex items-center justify-center mx-auto">
              <Camera className="w-7 h-7 text-emerald-300" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-extrabold text-white">Camera Start Nahi Hua</h3>
              <p className="text-xs text-slate-300">
                {cameraError || 'Live camera access allow karein ya phone camera se scan karein.'}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setRetryCounter((c) => c + 1)}
                className="bg-emerald-500 text-[#0A2540] font-extrabold text-xs py-3 rounded-xl active:scale-95"
              >
                Retry Live Camera
              </button>
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                className="bg-white/15 text-white font-bold text-xs py-3 rounded-xl border border-white/20 active:scale-95"
              >
                Phone Camera
              </button>
            </div>
          </div>
        )}

        {scanHint && !photoDecoding && (
          <p className="text-xs text-amber-200 bg-black/85 border border-amber-400/40 px-3.5 py-2 rounded-xl text-center max-w-xs">
            {scanHint}
          </p>
        )}
      </div>

      {/* Bottom Controls: Flash / Zoom / Flip / Gallery / Cancel */}
      <div className="relative z-10 pb-7 pt-4 px-5 bg-gradient-to-t from-black via-black/90 to-transparent flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {cameraState === 'live' && (
            <>
              <button
                type="button"
                onClick={toggleTorch}
                className={`h-10 px-3 rounded-full flex items-center gap-1.5 text-xs font-bold active:scale-95 ${
                  torchOn ? 'bg-amber-400 text-slate-900' : 'bg-white/15 text-white'
                }`}
                title="Flash / Torch"
              >
                {torchOn ? <Zap className="w-4 h-4" /> : <ZapOff className="w-4 h-4" />}
                <span>Flash</span>
              </button>

              {maxZoom > 1.2 && (
                <button
                  type="button"
                  onClick={cycleZoom}
                  className="h-10 px-3 rounded-full bg-white/15 text-white text-xs font-bold flex items-center gap-1 active:scale-95"
                  title="Zoom for tiny IMEI barcodes"
                >
                  <ZoomIn className="w-4 h-4 text-emerald-300" />
                  <span>{zoomLevel.toFixed(1)}x</span>
                </button>
              )}

              <button
                type="button"
                onClick={() =>
                  setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))
                }
                className="w-10 h-10 rounded-full bg-white/15 text-white flex items-center justify-center active:scale-95"
                title="Flip Camera"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => galleryInputRef.current?.click()}
            className="w-10 h-10 rounded-full bg-white/15 text-white flex items-center justify-center active:scale-95"
            title="Scan Barcode from Gallery"
          >
            <ImagePlus className="w-4 h-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="text-white font-bold text-sm px-4 py-2 rounded-xl bg-white/10 active:opacity-75"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};
