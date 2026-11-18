import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  ImagePlus,
  Loader2,
  RefreshCw,
  ScanLine,
  Sparkles,
  Zap,
  ZapOff,
} from 'lucide-react';
import {
  decodeBarcodeFromImageFile,
  extractScanWithVisionAI,
  type ScannedVisionResult,
} from '../services/integrations';

interface BarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (barcode: string, visionResult?: ScannedVisionResult) => void;
  scanMode?: 'barcode_or_imei' | 'bill_items';
  title?: string;
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
  const autoTriggeredRef = useRef(false);
  const onScanRef = useRef(onScanSuccess);
  const onCloseRef = useRef(onClose);

  onScanRef.current = onScanSuccess;
  onCloseRef.current = onClose;

  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [torchOn, setTorchOn] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [liveCameraReady, setLiveCameraReady] = useState(false);
  const [nativeModeActive, setNativeModeActive] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string | null>(null);
  const [scanHint, setScanHint] = useState<string | null>(null);

  const processCapturedFile = async (file: File) => {
    setScanHint(null);
    setProcessingStatus('Scanning barcode locally...');
    try {
      // Step A: Local Barcode Decode (BarcodeDetector + Html5Qrcode.scanFile)
      if (scanMode !== 'bill_items') {
        const localBarcode = await decodeBarcodeFromImageFile(file);
        if (localBarcode) {
          setProcessingStatus(null);
          onScanRef.current(localBarcode, {
            code: localBarcode,
            codeType: localBarcode.length === 15 ? 'imei' : 'barcode',
          });
          onCloseRef.current();
          return;
        }
      }

      // Step B: AI Vision OCR Fallback (Gemini Flash Vision -> Groq Vision)
      setProcessingStatus(
        scanMode === 'bill_items'
          ? 'Reading Bill Items & IMEI with AI Vision...'
          : 'Reading Barcode / 15-Digit IMEI with AI Vision...'
      );
      const visionResult = await extractScanWithVisionAI(file, scanMode);

      if (
        visionResult.code ||
        visionResult.productName ||
        (visionResult.items && visionResult.items.length > 0)
      ) {
        setProcessingStatus(null);
        onScanRef.current(
          visionResult.code || visionResult.productName || 'AI_SCANNED',
          visionResult
        );
        onCloseRef.current();
        return;
      }

      // If bill_items had no Vision match, still check local barcode as safety
      if (scanMode === 'bill_items') {
        const fallbackCode = await decodeBarcodeFromImageFile(file);
        if (fallbackCode) {
          setProcessingStatus(null);
          onScanRef.current(fallbackCode, { code: fallbackCode, codeType: 'barcode' });
          onCloseRef.current();
          return;
        }
      }

      setProcessingStatus(null);
      setScanHint('No barcode or IMEI clearly visible. Take a closer photo or type code above.');
    } catch (err) {
      console.warn('Image scan error:', err);
      setProcessingStatus(null);
      setScanHint('Could not read photo clearly. Try Native Camera closer or enter code above.');
    }
  };

  const handleSnapLiveFrame = () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) {
      nativeCameraInputRef.current?.click();
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
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
        }
      },
      'image/jpeg',
      0.9
    );
  };

  useEffect(() => {
    if (!isOpen) {
      autoTriggeredRef.current = false;
      setLiveCameraReady(false);
      setNativeModeActive(false);
      setProcessingStatus(null);
      setScanHint(null);
      return;
    }

    let stream: MediaStream | null = null;
    let animId: number | null = null;
    let active = true;
    let settled = false;

    const triggerNativeFallback = () => {
      if (!active || settled) return;
      settled = true;
      setLiveCameraReady(false);
      setNativeModeActive(true);
      if (!autoTriggeredRef.current) {
        autoTriggeredRef.current = true;
        // Automatically launch native hardware camera input without showing any error screen
        setTimeout(() => {
          nativeCameraInputRef.current?.click();
        }, 60);
      }
    };

    // 1.5-second watchdog for Android WebView camera hangs
    const timeoutId = window.setTimeout(() => {
      if (!settled) {
        triggerNativeFallback();
      }
    }, 1500);

    async function startLiveCamera() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        triggerNativeFallback();
        return;
      }

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

        settled = true;
        window.clearTimeout(timeoutId);
        setLiveCameraReady(true);
        setNativeModeActive(false);

        // Live BarcodeDetector scanning on video frames when supported
        const Win = window as unknown as {
          BarcodeDetector?: new (opts: { formats: string[] }) => {
            detect: (el: HTMLVideoElement) => Promise<{ rawValue: string }[]>;
          };
        };

        if (Win.BarcodeDetector && scanMode !== 'bill_items') {
          const detector = new Win.BarcodeDetector({
            formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'qr_code', 'itf'],
          });
          const loop = async () => {
            if (!active || !videoRef.current) return;
            try {
              if (videoRef.current.readyState >= 2) {
                const results = await detector.detect(videoRef.current);
                if (results && results.length > 0 && results[0].rawValue) {
                  const raw = results[0].rawValue.trim();
                  onScanRef.current(raw, {
                    code: raw,
                    codeType: raw.length === 15 ? 'imei' : 'barcode',
                  });
                  onCloseRef.current();
                  return;
                }
              }
            } catch {
              // ignore frame errors
            }
            animId = requestAnimationFrame(loop);
          };
          animId = requestAnimationFrame(loop);
        }
      } catch {
        // NotAllowedError, NotFoundError, or WebView restriction -> seamless native fallback
        window.clearTimeout(timeoutId);
        triggerNativeFallback();
      }
    }

    void startLiveCamera();

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
      if (animId) cancelAnimationFrame(animId);
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
      // Torch unavailable
    }
  };

  if (!isOpen) return null;

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
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
          liveCameraReady ? 'opacity-85' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Top Manual Input Bar */}
      <div className="relative z-10 pt-8 px-4 space-y-2">
        <div className="flex items-center justify-between text-white px-1">
          <span className="text-xs font-extrabold tracking-wide flex items-center gap-1.5">
            <ScanLine className="w-4 h-4 text-emerald-400" />
            {title || (scanMode === 'bill_items' ? 'AI Bill / IMEI Scanner' : 'Smart Barcode & IMEI Scanner')}
          </span>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/10 text-emerald-300">
            {liveCameraReady ? 'Live + AI' : 'Native APK Camera'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            placeholder="Type barcode or 15-digit IMEI..."
            className="flex-1 bg-black/75 border border-white/25 text-white text-sm rounded-xl px-3.5 py-2.5 outline-none focus:border-emerald-400"
          />
          {manualCode.trim() && (
            <button
              type="button"
              onClick={() => {
                const val = manualCode.trim();
                onScanSuccess(val, {
                  code: val,
                  codeType: val.length === 15 ? 'imei' : 'barcode',
                });
                setManualCode('');
                onClose();
              }}
              className="bg-emerald-500 text-[#0A2540] text-xs font-extrabold px-4 py-2.5 rounded-xl"
            >
              Use Code
            </button>
          )}
        </div>
      </div>

      {/* Center Viewfinder / Native APK Camera Card */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 gap-4">
        {processingStatus ? (
          <div className="bg-black/85 border border-emerald-400/40 rounded-3xl p-6 max-w-xs w-full text-center space-y-3 shadow-2xl">
            <Loader2 className="w-10 h-10 text-emerald-400 animate-spin mx-auto" />
            <p className="text-sm font-extrabold text-white">{processingStatus}</p>
            <p className="text-[11px] text-slate-300">
              Decoding 1D/2D barcode & Vision OCR IMEI / bill text...
            </p>
          </div>
        ) : liveCameraReady && !nativeModeActive ? (
          <>
            <div className="w-full max-w-sm h-48 relative rounded-2xl border-2 border-emerald-400/60 bg-black/10 overflow-hidden shadow-lg">
              <div className="absolute left-2 right-2 h-0.5 bg-red-500 shadow-[0_0_8px_#ef4444] animate-laser" />
            </div>
            <button
              type="button"
              onClick={handleSnapLiveFrame}
              className="bg-gradient-to-r from-emerald-500 to-teal-500 text-[#0A2540] font-extrabold text-xs px-5 py-2.5 rounded-full flex items-center gap-2 shadow-lg active:scale-95"
            >
              <Sparkles className="w-4 h-4" />
              <span>Snap Photo for IMEI / AI Scan</span>
            </button>
          </>
        ) : (
          <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-3xl p-5 max-w-sm w-full text-center space-y-4 shadow-2xl">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center mx-auto">
              <Camera className="w-8 h-8 text-emerald-300" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-extrabold text-white">Native APK Camera Scanner</h3>
              <p className="text-xs text-slate-300 leading-relaxed">
                Take a photo of any product barcode, 15-digit mobile IMEI sticker, or paper purchase bill.
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

        {scanHint && !processingStatus && (
          <p className="text-xs text-amber-200 bg-black/80 border border-amber-400/40 px-3.5 py-2 rounded-xl text-center max-w-xs">
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
            <span>Camera</span>
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
                onClick={() => setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))}
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
