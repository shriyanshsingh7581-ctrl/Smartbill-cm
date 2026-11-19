import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  ImagePlus,
  Loader2,
  RefreshCw,
  ScanLine,
  Sparkles,
  Zap,
  ZapOff,
  ZoomIn,
} from 'lucide-react';
import {
  createSafeNativeBarcodeDetector,
  decodeBarcodesFromCanvas,
  decodeBarcodesFromImageFile,
  extractScanWithVisionAI,
  isValidImeiLuhn,
  normalizeScannedCode,
  type ScannedVisionResult,
} from '../services/integrations';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (barcode: string, visionResult?: ScannedVisionResult) => void;
  scanMode?: 'barcode_or_imei' | 'bill_items';
  title?: string;
}

// Crisp POS scanner beep using Web Audio API + mobile haptic vibration
function playScanFeedback() {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(80);
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
    osc.frequency.setValueAtTime(1850, ctx.currentTime);
    gain.gain.setValueAtTime(0.14, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.11);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.11);
    setTimeout(() => {
      void ctx.close().catch(() => {});
    }, 200);
  } catch {
    // Audio playback blocked without user gesture
  }
}

export const BarcodeScannerModal: React.FC<BarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  onScanSuccess,
  scanMode = 'barcode_or_imei',
  title,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const nativeCameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const onScanRef = useRef(onScanSuccess);
  const onCloseRef = useRef(onClose);
  const scanLockedRef = useRef(false);

  onScanRef.current = onScanSuccess;
  onCloseRef.current = onClose;

  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [torchOn, setTorchOn] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [maxZoom, setMaxZoom] = useState<number>(1);
  const [manualCode, setManualCode] = useState('');
  const [liveCameraReady, setLiveCameraReady] = useState(false);
  const [nativeModeActive, setNativeModeActive] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string | null>(null);
  const [scanHint, setScanHint] = useState<string | null>(null);
  const [multiCodeChoices, setMultiCodeChoices] = useState<{
    codes: string[];
    visionResult?: ScannedVisionResult;
  } | null>(null);

  const finalizeCode = (rawCode: string, visionResult?: ScannedVisionResult) => {
    const clean = normalizeScannedCode(rawCode);
    if (!clean) return;
    scanLockedRef.current = true;
    playScanFeedback();
    const isImei = /^\d{15}$/.test(clean);
    onScanRef.current(clean, {
      ...(visionResult || {}),
      code: clean,
      codeType: visionResult?.codeType && visionResult.codeType !== 'none'
        ? visionResult.codeType
        : isImei
          ? 'imei'
          : 'barcode',
    });
    setMultiCodeChoices(null);
    setManualCode('');
    onCloseRef.current();
  };

  const handleDetectedCodes = (codes: string[], visionResult?: ScannedVisionResult) => {
    const unique = Array.from(new Set(codes.map(normalizeScannedCode).filter(Boolean)));
    if (unique.length === 0) return false;
    if (unique.length === 1) {
      finalizeCode(unique[0], visionResult);
      return true;
    }
    // Multiple codes found (e.g. IMEI 1 + IMEI 2 + EAN barcode on a mobile box) -> let user pick!
    scanLockedRef.current = true;
    playScanFeedback();
    setMultiCodeChoices({ codes: unique.slice(0, 6), visionResult });
    return true;
  };

  const processCapturedFile = async (file: File) => {
    setScanHint(null);
    setMultiCodeChoices(null);
    setProcessingStatus('Scanning barcode & IMEI locally...');
    try {
      // Step A: Multi-pass Local Decode (Native BarcodeDetector + ZXing TRY_HARDER + Html5Qrcode)
      let localRes = { primary: '', allCodes: [] as string[], codeType: 'none' as 'imei' | 'barcode' | 'none' };
      if (scanMode !== 'bill_items') {
        localRes = await decodeBarcodesFromImageFile(file);
        if (localRes.allCodes.length > 0) {
          setProcessingStatus(null);
          handleDetectedCodes(localRes.allCodes, {
            code: localRes.primary,
            allCodes: localRes.allCodes,
            codeType: localRes.codeType,
          });
          return;
        }
      }

      // Step B: AI Vision OCR Fallback (Groq Llama 4 Vision -> Gemini Flash Vision)
      setProcessingStatus(
        scanMode === 'bill_items'
          ? 'Reading Bill Items & IMEI with AI Vision...'
          : 'Reading Barcode / 15-Digit IMEI with AI Vision...'
      );
      const visionResult = await extractScanWithVisionAI(file, scanMode);

      if (scanMode === 'bill_items' && visionResult.items && visionResult.items.length > 0) {
        setProcessingStatus(null);
        playScanFeedback();
        onScanRef.current(
          visionResult.code || visionResult.items[0]?.imei || visionResult.items[0]?.barcode || 'AI_SCANNED',
          visionResult
        );
        onCloseRef.current();
        return;
      }

      const visionCodes = [
        ...(visionResult.allCodes || []),
        ...(visionResult.code ? [visionResult.code] : []),
      ];

      if (visionCodes.length > 0) {
        setProcessingStatus(null);
        handleDetectedCodes(visionCodes, visionResult);
        return;
      }

      if (visionResult.productName) {
        setProcessingStatus(null);
        playScanFeedback();
        onScanRef.current(visionResult.productName, visionResult);
        onCloseRef.current();
        return;
      }

      // If bill_items had no Vision match, still run local barcode decoder as safety
      if (scanMode === 'bill_items') {
        const fallbackLocal = await decodeBarcodesFromImageFile(file);
        if (fallbackLocal.allCodes.length > 0) {
          setProcessingStatus(null);
          handleDetectedCodes(fallbackLocal.allCodes, {
            code: fallbackLocal.primary,
            allCodes: fallbackLocal.allCodes,
            codeType: fallbackLocal.codeType,
          });
          return;
        }
      }

      setProcessingStatus(null);
      setScanHint(
        'Barcode ya IMEI clearly read nahi hua. Thoda paas aur roshni mein photo lein ya upar code type karein.'
      );
    } catch (err) {
      console.warn('Image scan error:', err);
      setProcessingStatus(null);
      setScanHint('Photo clear nahi thi. Camera se close photo lein ya upar code type karein.');
    }
  };

  const handleSnapLiveFrame = () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || !video.videoWidth) {
      nativeCameraInputRef.current?.click();
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      nativeCameraInputRef.current?.click();
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (blob) {
          const snapFile = new File([blob], 'live_capture.jpg', { type: 'image/jpeg' });
          void processCapturedFile(snapFile);
        } else {
          nativeCameraInputRef.current?.click();
        }
      },
      'image/jpeg',
      0.92
    );
  };

  useEffect(() => {
    if (!isOpen) {
      scanLockedRef.current = false;
      setLiveCameraReady(false);
      setNativeModeActive(false);
      setProcessingStatus(null);
      setScanHint(null);
      setMultiCodeChoices(null);
      setZoomLevel(1);
      setMaxZoom(1);
      setTorchOn(false);
      return;
    }

    scanLockedRef.current = false;
    let stream: MediaStream | null = null;
    let scanTimerId: number | null = null;
    let active = true;
    let settled = false;
    let tickCount = 0;

    const activateNativeMode = () => {
      if (!active || settled) return;
      settled = true;
      setLiveCameraReady(false);
      setNativeModeActive(true);
    };

    // 2.8-second watchdog for Android WebView camera hangs (gives autofocus cameras enough time)
    const timeoutId = window.setTimeout(() => {
      if (!settled) {
        activateNativeMode();
      }
    }, 2800);

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

    async function startLiveCamera() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        activateNativeMode();
        return;
      }

      try {
        stream = await acquireStream();

        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        // Enable continuous autofocus & detect zoom capabilities for close-up IMEI stickers
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
            // Focus/zoom constraints optional
          }
        }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        settled = true;
        window.clearTimeout(timeoutId);
        setLiveCameraReady(true);
        setNativeModeActive(false);

        if (scanMode === 'bill_items') {
          return;
        }

        // Dual Live Engine: Native BarcodeDetector (if available) + ZXing MultiFormatReader on offscreen canvas
        const nativeDetector = await createSafeNativeBarcodeDetector();
        const offscreenCanvas = document.createElement('canvas');
        const offscreenCtx = offscreenCanvas.getContext('2d', { willReadFrequently: true });

        const runLiveScanTick = async () => {
          if (!active || scanLockedRef.current) return;
          const video = videoRef.current;
          if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
            scanTimerId = window.setTimeout(() => void runLiveScanTick(), 250);
            return;
          }

          tickCount += 1;

          // 1. Native BarcodeDetector pass (fast, hardware-accelerated when present)
          if (nativeDetector) {
            try {
              const detected = await nativeDetector.detect(video);
              if (detected && detected.length > 0) {
                const rawCodes = detected
                  .map((d) => normalizeScannedCode(d.rawValue || ''))
                  .filter(Boolean);
                if (rawCodes.length > 0 && !scanLockedRef.current) {
                  handleDetectedCodes(rawCodes);
                  return;
                }
              }
            } catch {
              // ignore frame errors
            }
          }

          // 2. ZXing MultiFormatReader live canvas pass (100% works in ALL Android WebViews, Safari, Firefox, Chrome!)
          if (offscreenCtx && !scanLockedRef.current) {
            try {
              const vw = video.videoWidth;
              const vh = video.videoHeight;

              // Alternate between focused center barcode/IMEI strip (ticks 1,2) and wider frame (tick 3)
              const isCenterStrip = tickCount % 3 !== 0;
              const sx = isCenterStrip ? Math.floor(vw * 0.06) : 0;
              const sy = isCenterStrip ? Math.floor(vh * 0.24) : Math.floor(vh * 0.08);
              const sw = isCenterStrip ? Math.floor(vw * 0.88) : vw;
              const sh = isCenterStrip ? Math.floor(vh * 0.52) : Math.floor(vh * 0.84);

              // Cap width around 960px for crisp 1D bars while staying fast (~30ms)
              const scale = Math.min(1, 960 / Math.max(1, sw));
              offscreenCanvas.width = Math.max(64, Math.round(sw * scale));
              offscreenCanvas.height = Math.max(64, Math.round(sh * scale));
              offscreenCtx.drawImage(
                video,
                sx,
                sy,
                sw,
                sh,
                0,
                0,
                offscreenCanvas.width,
                offscreenCanvas.height
              );

              const zxingCodes = decodeBarcodesFromCanvas(offscreenCanvas, {
                tryRotated: tickCount % 4 === 0, // Every 4th tick checks vertical IMEI stickers
                tryInverted: false,
                scanSlices: false,
              });

              if (zxingCodes.length > 0 && !scanLockedRef.current) {
                handleDetectedCodes(zxingCodes);
                return;
              }
            } catch {
              // ignore canvas decode error
            }
          }

          if (active && !scanLockedRef.current) {
            scanTimerId = window.setTimeout(() => void runLiveScanTick(), 260);
          }
        };

        scanTimerId = window.setTimeout(() => void runLiveScanTick(), 300);
      } catch {
        window.clearTimeout(timeoutId);
        activateNativeMode();
      }
    }

    void startLiveCamera();

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
      if (scanTimerId) window.clearTimeout(scanTimerId);
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [isOpen, facingMode, scanMode]);

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
    const steps = maxZoom >= 2.5 ? [1, 1.6, 2.4] : maxZoom >= 1.5 ? [1, 1.5] : [1];
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
      // Zoom constraint unsupported
    }
  };

  const submitManualCode = () => {
    const clean = normalizeScannedCode(manualCode);
    if (!clean) return;
    finalizeCode(clean);
  };

  if (!isOpen) return null;

  const manualClean = normalizeScannedCode(manualCode);
  const manualIsValidImei = /^\d{15}$/.test(manualClean) && isValidImeiLuhn(manualClean);

  return (
    <div className="fixed inset-0 z-50 bg-[#071423] flex flex-col justify-between">
      {/* Hidden Direct Hardware Camera & Gallery Inputs (100% Web-APK Compatible) */}
      <input
        ref={nativeCameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void processCapturedFile(file);
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
          if (file) void processCapturedFile(file);
        }}
      />

      {/* Live Video Stream Layer */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
          liveCameraReady ? 'opacity-90' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Top Manual Input Bar */}
      <div className="relative z-10 pt-7 px-4 space-y-2 bg-gradient-to-b from-black/80 via-black/40 to-transparent pb-3">
        <div className="flex items-center justify-between text-white px-1">
          <span className="text-xs font-extrabold tracking-wide flex items-center gap-1.5">
            <ScanLine className="w-4 h-4 text-emerald-400" />
            {title ||
              (scanMode === 'bill_items' ? 'AI Bill / IMEI Scanner' : 'Smart Barcode & IMEI Scanner')}
          </span>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/15 text-emerald-300">
            {liveCameraReady ? 'Live ZXing + AI' : 'Native APK Camera'}
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
              placeholder="Type barcode or 15-digit IMEI..."
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
              Use Code
            </button>
          )}
        </div>
      </div>

      {/* Center Viewfinder / Processing / Multi-Code Picker / Native APK Camera Card */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-5 gap-3.5">
        {processingStatus ? (
          <div className="bg-black/85 border border-emerald-400/40 rounded-3xl p-6 max-w-xs w-full text-center space-y-3 shadow-2xl">
            <Loader2 className="w-10 h-10 text-emerald-400 animate-spin mx-auto" />
            <p className="text-sm font-extrabold text-white">{processingStatus}</p>
            <p className="text-[11px] text-slate-300">
              Decoding 1D/2D barcode, 15-digit IMEI &amp; AI Vision OCR...
            </p>
          </div>
        ) : multiCodeChoices ? (
          <div className="bg-[#0A2540] border border-emerald-400/40 rounded-3xl p-5 max-w-sm w-full space-y-3 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-extrabold text-white flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>{multiCodeChoices.codes.length} Codes Detected</span>
                </h3>
                <p className="text-[11px] text-slate-300 mt-0.5">
                  Select the IMEI or Barcode you want to use:
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  scanLockedRef.current = false;
                  setMultiCodeChoices(null);
                }}
                className="text-xs text-slate-300 underline"
              >
                Rescan
              </button>
            </div>
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {multiCodeChoices.codes.map((code, idx) => {
                const isImei = /^\d{15}$/.test(code);
                const luhnOk = isImei && isValidImeiLuhn(code);
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => finalizeCode(code, multiCodeChoices.visionResult)}
                    className="w-full bg-white/10 hover:bg-emerald-500/20 border border-white/15 hover:border-emerald-400 rounded-xl px-3.5 py-2.5 flex items-center justify-between text-left active:scale-[0.98] transition"
                  >
                    <div>
                      <p className="text-sm font-mono font-extrabold text-white tracking-wider">
                        {code}
                      </p>
                      <p className="text-[10px] text-emerald-300 font-semibold mt-0.5">
                        {isImei
                          ? `IMEI ${idx + 1} (15-digit${luhnOk ? ' · Verified ✓' : ''})`
                          : `Barcode (${code.length} chars)`}
                      </p>
                    </div>
                    <span className="bg-emerald-500 text-[#0A2540] text-[10px] font-extrabold px-2.5 py-1 rounded-lg">
                      Select
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : liveCameraReady && !nativeModeActive ? (
          <>
            <div className="w-full max-w-sm h-48 relative rounded-2xl border-2 border-emerald-400/75 bg-black/10 overflow-hidden shadow-lg">
              {/* Corner brackets */}
              <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-emerald-400 rounded-tl-xl" />
              <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-emerald-400 rounded-tr-xl" />
              <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-emerald-400 rounded-bl-xl" />
              <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-emerald-400 rounded-br-xl" />
              <div className="absolute left-2 right-2 h-0.5 bg-red-500 shadow-[0_0_10px_#ef4444] animate-laser" />
              <div className="absolute bottom-2 inset-x-0 text-center">
                <span className="text-[10px] font-bold bg-black/65 text-white px-2.5 py-0.5 rounded-full">
                  Align Barcode or 15-Digit IMEI inside box
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSnapLiveFrame}
                className="bg-gradient-to-r from-emerald-500 to-teal-500 text-[#0A2540] font-extrabold text-xs px-5 py-2.5 rounded-full flex items-center gap-2 shadow-lg active:scale-95"
              >
                <Sparkles className="w-4 h-4" />
                <span>Snap &amp; AI Scan (IMEI / Bill)</span>
              </button>
              {maxZoom > 1.2 && (
                <button
                  type="button"
                  onClick={cycleZoom}
                  className="bg-black/75 border border-white/25 text-white font-bold text-xs px-3 py-2.5 rounded-full flex items-center gap-1 active:scale-95"
                  title="Zoom for small IMEI barcodes"
                >
                  <ZoomIn className="w-3.5 h-3.5 text-emerald-300" />
                  <span>{zoomLevel.toFixed(1)}x</span>
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-3xl p-5 max-w-sm w-full text-center space-y-4 shadow-2xl">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center mx-auto">
              <Camera className="w-8 h-8 text-emerald-300" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-extrabold text-white">Camera Barcode &amp; IMEI Scanner</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Take a clear close-up photo of any product barcode, 15-digit mobile IMEI sticker, or
                purchase bill.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => nativeCameraInputRef.current?.click()}
                className="bg-emerald-500 hover:bg-emerald-400 text-[#0A2540] font-extrabold text-xs py-3 px-3 rounded-xl flex items-center justify-center gap-1.5 shadow-md active:scale-95"
              >
                <Camera className="w-4 h-4" />
                <span>Open Camera</span>
              </button>
              <button
                type="button"
                onClick={() => galleryInputRef.current?.click()}
                className="bg-white/15 hover:bg-white/25 text-white font-bold text-xs py-3 px-3 rounded-xl flex items-center justify-center gap-1.5 border border-white/20 active:scale-95"
              >
                <ImagePlus className="w-4 h-4" />
                <span>Gallery</span>
              </button>
            </div>
          </div>
        )}

        {scanHint && !processingStatus && !multiCodeChoices && (
          <p className="text-xs text-amber-200 bg-black/85 border border-amber-400/40 px-3.5 py-2 rounded-xl text-center max-w-xs">
            {scanHint}
          </p>
        )}
      </div>

      {/* Bottom Action Bar: Camera / Gallery / Flip / Flash / Cancel */}
      <div className="relative z-10 pb-7 pt-4 px-5 bg-gradient-to-t from-black via-black/90 to-transparent flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => nativeCameraInputRef.current?.click()}
            className="h-11 px-3.5 rounded-full bg-emerald-500 text-[#0A2540] font-extrabold text-xs flex items-center gap-1.5 active:scale-95"
            title="Capture with Native Camera"
          >
            <Camera className="w-4 h-4" />
            <span>Photo Scan</span>
          </button>

          <button
            type="button"
            onClick={() => galleryInputRef.current?.click()}
            className="w-11 h-11 rounded-full bg-white/15 text-white flex items-center justify-center active:scale-95"
            title="Upload from Gallery"
          >
            <ImagePlus className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          {liveCameraReady && (
            <>
              <button
                type="button"
                onClick={() =>
                  setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))
                }
                className="w-10 h-10 rounded-full bg-white text-slate-900 flex items-center justify-center active:scale-95"
                title="Flip Camera"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={toggleTorch}
                className="w-10 h-10 rounded-full bg-white/15 text-white flex items-center justify-center active:scale-95"
                title="Toggle Flash"
              >
                {torchOn ? <Zap className="w-5 h-5 text-yellow-400" /> : <ZapOff className="w-5 h-5" />}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onClose}
            className="text-white font-semibold text-sm px-3 py-2 active:opacity-75"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
