import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Check,
  CheckCircle2,
  ImagePlus,
  Loader2,
  RefreshCw,
  ScanLine,
  X,
  Zap,
  ZapOff,
  ZoomIn,
} from 'lucide-react';
import {
  boostImageDataContrast,
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
  bulkMode?: boolean;
  initialCodes?: string[];
  onBulkComplete?: (codes: string[]) => void;
}

// Shared AudioContext for instant zero-latency POS scanner beep + haptic vibration
let sharedBeepCtx: AudioContext | null = null;
function playScanFeedback() {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(65);
    }
  } catch {
    // ignore vibration errors
  }
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    if (!sharedBeepCtx || sharedBeepCtx.state === 'closed') {
      sharedBeepCtx = new AudioCtx();
    }
    if (sharedBeepCtx.state === 'suspended') {
      void sharedBeepCtx.resume().catch(() => {});
    }
    const now = sharedBeepCtx.currentTime;
    const osc = sharedBeepCtx.createOscillator();
    const gain = sharedBeepCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(2050, now);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    osc.connect(gain);
    gain.connect(sharedBeepCtx.destination);
    osc.start(now);
    osc.stop(now + 0.09);
  } catch {
    // Audio playback blocked without gesture
  }
}

const EMPTY_CODES: string[] = [];

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  onScanSuccess,
  title,
  bulkMode = false,
  initialCodes = EMPTY_CODES,
  onBulkComplete,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const onScanRef = useRef(onScanSuccess);
  const onCloseRef = useRef(onClose);
  const onBulkCompleteRef = useRef(onBulkComplete);
  const initialCodesRef = useRef(initialCodes);
  const scanLockedRef = useRef(false);
  const bulkModeRef = useRef(bulkMode);
  const bulkCodesRef = useRef<string[]>([]);
  const lastBulkToastTimerRef = useRef<number | null>(null);
  const duplicateCooldownMapRef = useRef<Map<string, number>>(new Map());

  onScanRef.current = onScanSuccess;
  onCloseRef.current = onClose;
  onBulkCompleteRef.current = onBulkComplete;
  initialCodesRef.current = initialCodes;
  bulkModeRef.current = bulkMode;

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
  const [bulkCodes, setBulkCodes] = useState<string[]>([]);
  const [focusPulse, setFocusPulse] = useState(false);

  // Sync initial bulk codes once whenever modal opens (avoids re-render loops on new array refs)
  useEffect(() => {
    if (isOpen) {
      const cleanInit = Array.from(
        new Set(initialCodesRef.current.map((c) => normalizeScannedCode(c)).filter(Boolean))
      );
      bulkCodesRef.current = cleanInit;
      setBulkCodes(cleanInit);
      duplicateCooldownMapRef.current.clear();
    }
  }, [isOpen]);

  const emitCodes = (rawCodes: string[]) => {
    const cleanedList = Array.from(
      new Set(rawCodes.map((c) => normalizeScannedCode(c)).filter((c) => c.length >= 4))
    );
    if (cleanedList.length === 0) return;

    if (bulkModeRef.current) {
      const now = Date.now();
      const addedNow: string[] = [];
      for (const code of cleanedList) {
        const lastSeen = duplicateCooldownMapRef.current.get(code) || 0;
        if (now - lastSeen < 1400) continue;
        duplicateCooldownMapRef.current.set(code, now);
        if (!bulkCodesRef.current.includes(code)) {
          bulkCodesRef.current = [code, ...bulkCodesRef.current];
          addedNow.push(code);
        }
      }

      if (addedNow.length > 0) {
        playScanFeedback();
        setBulkCodes([...bulkCodesRef.current]);
        setDetectedFlashCode(
          addedNow.length === 1 ? addedNow[0] : `+${addedNow.length} codes added`
        );
        setScanHint(null);
        if (lastBulkToastTimerRef.current) {
          window.clearTimeout(lastBulkToastTimerRef.current);
        }
        lastBulkToastTimerRef.current = window.setTimeout(() => {
          setDetectedFlashCode(null);
        }, 650);
      }
      return;
    }

    // Single-code instant mode: 25ms visual flash for instant "fatak se" scan feel
    const primary = cleanedList[0];
    if (!primary || scanLockedRef.current) return;
    scanLockedRef.current = true;
    playScanFeedback();
    setDetectedFlashCode(primary);

    const isImei = /^\d{15}$/.test(primary);
    window.setTimeout(() => {
      onScanRef.current(primary, {
        code: primary,
        allCodes: cleanedList,
        codeType: isImei ? 'imei' : 'barcode',
      });
      setDetectedFlashCode(null);
      setManualCode('');
      onCloseRef.current();
    }, 25);
  };

  // Pure local photo barcode/IMEI decode (fast multi-pass local ZXing + Native)
  const processLocalPhotoFile = async (file: File) => {
    setScanHint(null);
    setPhotoDecoding(true);
    try {
      const localRes = await decodeBarcodesFromImageFile(file);
      if (localRes.allCodes.length > 0) {
        setPhotoDecoding(false);
        emitCodes(bulkModeRef.current ? localRes.allCodes : [localRes.primary]);
        return;
      }
      setPhotoDecoding(false);
      setScanHint('Photo mein barcode/IMEI clear nahi mila. Camera ko thoda seedha aur nazdeek rakhein.');
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
    let scanRafId: number | null = null;
    let scanTimerId: number | null = null;
    let active = true;
    let tickCount = 0;

    // Preload local C++ ZXing-WASM & native detector immediately in parallel with camera startup
    const decodersPromise = Promise.all([
      warmupZxingWasm(),
      createSafeNativeBarcodeDetector(),
    ]);

    async function acquireStream(): Promise<MediaStream> {
      // Request crisp 1920x1080 @ 30fps first so tiny 15-digit IMEI Code-128 bars have 2.2x sharper pixels,
      // falling back seamlessly to 1280x720 or default camera.
      const attempts: MediaStreamConstraints[] = [
        {
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1920, min: 1280 },
            height: { ideal: 1080, min: 720 },
            frameRate: { ideal: 30 },
          },
          audio: false,
        },
        {
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1280, min: 640 },
            height: { ideal: 720, min: 480 },
            frameRate: { ideal: 30 },
          },
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

        // Enable continuous autofocus + auto 1.5x zoom on single-IMEI scan so tiny mobile box stickers lock instantly
        const track = stream.getVideoTracks()[0];
        if (track && typeof track.getCapabilities === 'function') {
          try {
            const caps = track.getCapabilities() as Record<string, unknown>;
            if (caps) {
              const adv: MediaTrackConstraintSet[] = [];
              const focusModes = Array.isArray(caps.focusMode) ? (caps.focusMode as string[]) : [];
              if (focusModes.includes('continuous')) {
                adv.push({ focusMode: 'continuous' } as MediaTrackConstraintSet);
              }
              const zoomCap = caps.zoom as { min?: number; max?: number } | undefined;
              if (zoomCap && typeof zoomCap.max === 'number' && zoomCap.max > 1.2) {
                const clampedMax = Math.min(zoomCap.max, 4);
                setMaxZoom(clampedMax);
                // Auto-apply gentle 1.5x macro-friendly zoom in single-IMEI mode
                if (!bulkModeRef.current && clampedMax >= 1.5) {
                  adv.push({ zoom: 1.5 } as MediaTrackConstraintSet);
                  setZoomLevel(1.5);
                }
              }
              if (adv.length > 0) {
                await track.applyConstraints({ advanced: adv });
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

        // Await already-started decoder init
        const [wasmReady, nativeDetector] = await decodersPromise;

        const scanCanvas = document.createElement('canvas');
        const scanCtx = scanCanvas.getContext('2d', { willReadFrequently: true });

        const scheduleNextTick = (delayMs: number) => {
          if (!active || (!bulkModeRef.current && scanLockedRef.current)) return;
          if (delayMs <= 0) {
            scanRafId = window.requestAnimationFrame(() => void runAutoScanTick());
          } else {
            scanTimerId = window.setTimeout(() => {
              if (active) {
                scanRafId = window.requestAnimationFrame(() => void runAutoScanTick());
              }
            }, delayMs);
          }
        };

        const runAutoScanTick = async () => {
          if (!active || (!bulkModeRef.current && scanLockedRef.current)) return;
          const video = videoRef.current;
          if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
            scheduleNextTick(30);
            return;
          }

          tickCount += 1;
          const frameFound: string[] = [];

          // Step 1: Hardware-accelerated Native BarcodeDetector (~4-8ms GPU on Android Chrome/WebView!)
          if (nativeDetector) {
            try {
              const detected = await nativeDetector.detect(video);
              if (detected && detected.length > 0) {
                const midX = video.videoWidth / 2;
                const midY = video.videoHeight / 2;
                const ranked = detected
                  .map((d) => {
                    const code = normalizeScannedCode(d.rawValue || '');
                    let dist = 999999;
                    if (d.boundingBox) {
                      const cx = d.boundingBox.x + d.boundingBox.width / 2;
                      const cy = d.boundingBox.y + d.boundingBox.height / 2;
                      dist = Math.hypot(cx - midX, (cy - midY) * 1.6);
                    }
                    return { code, dist };
                  })
                  .filter((item) => item.code.length >= 4);

                if (ranked.length > 0) {
                  ranked.sort((a, b) => {
                    const score = (c: string) =>
                      /^\d{15}$/.test(c) && isValidImeiLuhn(c) ? 3 : /^\d{15}$/.test(c) ? 2 : 1;
                    const diff = score(b.code) - score(a.code);
                    if (diff !== 0) return diff;
                    return a.dist - b.dist;
                  });
                  const codes = ranked.map((r) => r.code);
                  if (bulkModeRef.current) {
                    frameFound.push(...codes);
                  } else {
                    emitCodes(codes);
                    return;
                  }
                }
              }
            } catch {
              // ignore native frame error
            }
          }

          // Step 2: Zero-stall Turbo 1D ZXing-WASM on tight 1:1 native-pixel laser strip (~6-14ms!)
          // When Native BarcodeDetector IS present, only invoke WASM every 2nd tick so GPU native detector stays at 30-60fps!
          const shouldRunWasm =
            Boolean(scanCtx) &&
            (bulkModeRef.current || !scanLockedRef.current) &&
            (!nativeDetector || tickCount % 2 === 0 || bulkModeRef.current);

          if (scanCtx && shouldRunWasm) {
            try {
              const vw = video.videoWidth;
              const vh = video.videoHeight;

              const isBulkMode = bulkModeRef.current;
              const isRotatedOrQrTick = tickCount % 4 === 0;
              const isContrastTick = tickCount % 8 === 0;

              let sx: number;
              let sy: number;
              let sw: number;
              let sh: number;
              let maxW: number;
              let wasmMode: 'turbo' | 'fast' | 'deep';

              if (isBulkMode) {
                const isWideTick = tickCount % 2 === 0;
                sx = isWideTick ? 0 : Math.floor(vw * 0.04);
                sy = isWideTick ? Math.floor(vh * 0.06) : Math.floor(vh * 0.2);
                sw = isWideTick ? vw : Math.floor(vw * 0.92);
                sh = isWideTick ? Math.floor(vh * 0.88) : Math.floor(vh * 0.6);
                maxW = isWideTick ? 1024 : 900;
                wasmMode = isWideTick ? 'deep' : 'fast';
              } else if (isRotatedOrQrTick) {
                // Slightly taller center box to catch vertical/tilted IMEI stickers or QR codes (~20ms)
                sx = Math.floor(vw * 0.08);
                sy = Math.floor(vh * 0.22);
                sw = Math.floor(vw * 0.84);
                sh = Math.floor(vh * 0.56);
                maxW = 840;
                wasmMode = 'fast';
              } else {
                // Tight 1:1 native-resolution horizontal laser strip: ZERO downscaling blur on thin 15-digit IMEI bars (~6-12ms!)
                sx = Math.floor(vw * 0.06);
                sy = Math.floor(vh * 0.34);
                sw = Math.floor(vw * 0.88);
                sh = Math.floor(vh * 0.32);
                maxW = 1080;
                wasmMode = 'turbo';
              }

              const scale = Math.min(1, maxW / Math.max(1, sw));
              const cw = Math.max(64, Math.round(sw * scale));
              const ch = Math.max(64, Math.round(sh * scale));

              if (scanCanvas.width !== cw || scanCanvas.height !== ch) {
                scanCanvas.width = cw;
                scanCanvas.height = ch;
              }
              scanCtx.drawImage(video, sx, sy, sw, sh, 0, 0, cw, ch);

              if (wasmReady) {
                const rawImgData = scanCtx.getImageData(0, 0, cw, ch);
                const targetImgData = isContrastTick
                  ? boostImageDataContrast(rawImgData)
                  : rawImgData;
                const symbols = await decodeImageDataWithZxingWasm(targetImgData, wasmMode);
                if (symbols.length > 0) {
                  const texts = symbols.map((s) => s.text);
                  if (bulkModeRef.current) {
                    frameFound.push(...texts);
                  } else {
                    emitCodes(texts);
                    return;
                  }
                }
              } else if (!nativeDetector) {
                // Pure JS fallback ONLY when neither Native BarcodeDetector nor WASM is available
                const jsCodes = decodeBarcodesFromCanvas(scanCanvas, {
                  tryRotated: tickCount % 4 === 0,
                  tryInverted: false,
                  scanSlices: false,
                });
                if (jsCodes.length > 0) {
                  if (bulkModeRef.current) {
                    frameFound.push(...jsCodes);
                  } else {
                    emitCodes(jsCodes);
                    return;
                  }
                }
              }
            } catch {
              // continue scanning next frame
            }
          }

          if (bulkModeRef.current && frameFound.length > 0) {
            emitCodes(frameFound);
          }

          // Zero-lag next frame: rAF immediately when native GPU detector is active, else 8ms breather
          scheduleNextTick(nativeDetector ? 0 : 8);
        };

        // Start scanning immediately on the very first live frame!
        scheduleNextTick(0);
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
      if (scanRafId) window.cancelAnimationFrame(scanRafId);
      if (scanTimerId) window.clearTimeout(scanTimerId);
      if (lastBulkToastTimerRef.current) window.clearTimeout(lastBulkToastTimerRef.current);
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

  const applyZoom = async (targetZoom: number) => {
    const clamped = Math.min(maxZoom, Math.max(1, targetZoom));
    setZoomLevel(clamped);
    try {
      const stream = videoRef.current?.srcObject as MediaStream | null;
      const track = stream?.getVideoTracks()[0];
      if (track && 'applyConstraints' in track) {
        await track.applyConstraints({
          advanced: [{ zoom: clamped } as MediaTrackConstraintSet],
        });
      }
    } catch {
      // ignore unsupported zoom
    }
  };

  const triggerTapRefocus = async () => {
    setFocusPulse(true);
    window.setTimeout(() => setFocusPulse(false), 450);
    try {
      const stream = videoRef.current?.srcObject as MediaStream | null;
      const track = stream?.getVideoTracks()[0];
      if (track && 'applyConstraints' in track) {
        await track.applyConstraints({
          advanced: [{ focusMode: 'single-shot' } as MediaTrackConstraintSet],
        });
        window.setTimeout(() => {
          void track
            .applyConstraints({
              advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet],
            })
            .catch(() => {});
        }, 350);
      }
    } catch {
      // ignore unsupported single-shot focus
    }
  };

  const submitManualCode = () => {
    const clean = normalizeScannedCode(manualCode);
    if (!clean) return;
    emitCodes([clean]);
    if (bulkMode) {
      setManualCode('');
    }
  };

  const removeBulkCode = (codeToRemove: string) => {
    const next = bulkCodesRef.current.filter((c) => c !== codeToRemove);
    bulkCodesRef.current = next;
    setBulkCodes(next);
  };

  const handleFinishBulk = () => {
    if (onBulkCompleteRef.current) {
      onBulkCompleteRef.current([...bulkCodesRef.current]);
    }
    onCloseRef.current();
  };

  if (!isOpen) return null;

  const manualClean = normalizeScannedCode(manualCode);
  const manualIsValidImei = /^\d{15}$/.test(manualClean) && isValidImeiLuhn(manualClean);
  const zoomStops = maxZoom >= 2.8 ? [1, 1.5, 2, 3] : maxZoom >= 1.9 ? [1, 1.5, 2] : [1, 1.5];

  return (
    <div className="fixed inset-0 z-[60] bg-black flex flex-col justify-between">
      {/* Hidden local photo/gallery fallback inputs */}
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

      {/* Full-Screen Live Camera Video (tap anywhere to refocus!) */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        onClick={() => void triggerTapRefocus()}
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-200 ${
          cameraState === 'live' ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Top Header + Manual Entry Bar */}
      <div className="relative z-10 pt-6 px-4 pb-3 space-y-2 bg-gradient-to-b from-black/85 via-black/50 to-transparent">
        <div className="flex items-center justify-between text-white px-1">
          <span className="text-xs font-extrabold tracking-wide flex items-center gap-1.5">
            <ScanLine className="w-4 h-4 text-emerald-400" />
            {title || (bulkMode ? 'Bulk Rapid IMEI Scanner' : 'Fast Barcode & IMEI Scanner')}
          </span>
          {bulkMode ? (
            <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-emerald-500 text-[#0A2540] tabular-nums">
              {bulkCodes.length} Scanned
            </span>
          ) : (
            <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300">
              {cameraState === 'live' ? 'Turbo Auto Scan' : 'Starting...'}
            </span>
          )}
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
              {bulkMode ? '+ Add' : 'OK'}
            </button>
          )}
        </div>
      </div>

      {/* Center Auto-Scan Laser Viewfinder */}
      <div
        onClick={() => void triggerTapRefocus()}
        className="relative z-10 flex-1 flex flex-col items-center justify-center px-5 gap-3"
      >
        {photoDecoding ? (
          <div className="bg-black/85 border border-emerald-400/40 rounded-2xl p-6 max-w-xs w-full text-center space-y-2.5">
            <Loader2 className="w-9 h-9 text-emerald-400 animate-spin mx-auto" />
            <p className="text-sm font-bold text-white">Decoding Barcode / IMEI...</p>
          </div>
        ) : cameraState === 'live' ? (
          <>
            <div
              className={`w-full max-w-sm ${bulkMode ? 'h-48' : 'h-44'} relative rounded-2xl border-2 overflow-hidden transition-all duration-150 ${
                detectedFlashCode
                  ? 'border-emerald-400 bg-emerald-500/25 shadow-[0_0_25px_rgba(16,185,129,0.75)]'
                  : focusPulse
                    ? 'border-amber-300 bg-amber-300/10'
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

            {/* Quick Zoom Pills for tiny IMEI barcodes */}
            {maxZoom > 1.2 && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1.5 bg-black/65 px-2 py-1 rounded-full border border-white/15"
              >
                <ZoomIn className="w-3.5 h-3.5 text-emerald-300 ml-1" />
                {zoomStops.map((z) => (
                  <button
                    key={z}
                    type="button"
                    onClick={() => void applyZoom(z)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors ${
                      Math.abs(zoomLevel - z) < 0.15
                        ? 'bg-emerald-500 text-[#0A2540]'
                        : 'text-white/85 hover:bg-white/10'
                    }`}
                  >
                    {z}x
                  </button>
                ))}
              </div>
            )}

            <p className="text-xs font-semibold text-white bg-black/70 px-4 py-1.5 rounded-full text-center">
              {detectedFlashCode
                ? bulkMode
                  ? 'Added! Next box scan karein...'
                  : 'Scanned!'
                : bulkMode
                  ? 'Ek ke baad ek sabhi box scan karein (Tap to focus)'
                  : 'Barcode ya IMEI ko box mein rakhein — turant scan hoga'}
            </p>
          </>
        ) : cameraState === 'starting' ? (
          <div className="bg-black/75 border border-white/15 rounded-2xl p-6 max-w-xs w-full text-center space-y-2.5">
            <Loader2 className="w-9 h-9 text-emerald-400 animate-spin mx-auto" />
            <p className="text-sm font-bold text-white">Camera chalu ho raha hai...</p>
            <p className="text-[11px] text-slate-300">Turbo auto-scan ready in 1 second</p>
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

      {/* Bottom Controls (+ Bulk Live Scanned Tray when bulkMode=true) */}
      <div className="relative z-10 pb-6 pt-3 px-4 bg-gradient-to-t from-black via-black/95 to-transparent space-y-3">
        {bulkMode && bulkCodes.length > 0 && (
          <div className="bg-white/10 border border-white/15 rounded-2xl p-2.5 space-y-2 backdrop-blur-md">
            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] font-bold text-emerald-300">
                Scanned IMEIs / Codes ({bulkCodes.length})
              </span>
              <button
                type="button"
                onClick={() => {
                  bulkCodesRef.current = [];
                  setBulkCodes([]);
                }}
                className="text-[10px] font-bold text-rose-300"
              >
                Clear All
              </button>
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
              {bulkCodes.map((c, idx) => (
                <div
                  key={c}
                  className="shrink-0 flex items-center gap-1.5 bg-black/70 border border-emerald-400/40 text-white rounded-xl px-2.5 py-1.5 text-[11px] font-mono"
                >
                  <span className="text-emerald-400 font-bold">#{bulkCodes.length - idx}</span>
                  <span>{c}</span>
                  <button
                    type="button"
                    onClick={() => removeBulkCode(c)}
                    className="text-slate-400 hover:text-rose-400"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
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

          <div className="flex items-center gap-2">
            {bulkMode && (
              <button
                type="button"
                onClick={handleFinishBulk}
                className="bg-emerald-500 text-[#0A2540] font-extrabold text-xs px-4 py-2.5 rounded-xl flex items-center gap-1.5 shadow-lg active:scale-95"
              >
                <Check className="w-4 h-4" />
                <span>Done ({bulkCodes.length})</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="text-white font-bold text-xs px-3.5 py-2.5 rounded-xl bg-white/10 active:opacity-75"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
