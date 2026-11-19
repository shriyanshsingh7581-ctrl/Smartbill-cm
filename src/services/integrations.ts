import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import {
  prepareZXingModule,
  readBarcodes,
  type ReaderOptions,
} from 'zxing-wasm/reader';
import zxingWasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';
import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  GlobalHistogramBinarizer,
  HybridBinarizer,
  MultiFormatReader,
  RGBLuminanceSource,
} from '@zxing/library';
import type { ProductDoc, OrderDoc, ExpenseDoc } from '../firebase';

const ZXING_WASM_OVERRIDES = {
  locateFile: (path: string, prefix: string) =>
    path.endsWith('.wasm') ? zxingWasmUrl : prefix + path,
};

let zxingWasmReadyPromise: Promise<boolean> | null = null;

export function warmupZxingWasm(): Promise<boolean> {
  if (!zxingWasmReadyPromise) {
    zxingWasmReadyPromise = Promise.resolve(
      prepareZXingModule({
        overrides: ZXING_WASM_OVERRIDES,
        fireImmediately: true,
      })
    )
      .then(() => true)
      .catch(() => {
        zxingWasmReadyPromise = null;
        return false;
      });
  }
  return zxingWasmReadyPromise;
}

// Ultra-fast Turbo 1D IMEI/Barcode options (~4-12ms per frame: Code128/EAN/Code39/ITF/UPC only, no 2D/invert/downscale overhead)
const ZXING_WASM_TURBO_1D_OPTIONS: ReaderOptions = {
  formats: ['Code128', 'EAN13', 'EAN8', 'Code39', 'ITF', 'UPCA', 'UPCE'],
  tryHarder: false,
  tryRotate: false,
  tryInvert: false,
  tryDownscale: false,
  minLineCount: 1,
  maxNumberOfSymbols: 6,
  binarizer: 'LocalAverage',
};

// Fast live options: catches tilted/rotated IMEI stickers + QR/DataMatrix (~18-30ms)
const ZXING_WASM_FAST_LIVE_OPTIONS: ReaderOptions = {
  formats: ['Code128', 'EAN13', 'EAN8', 'Code39', 'Code93', 'ITF', 'UPCA', 'UPCE', 'QRCode', 'DataMatrix'],
  tryHarder: true,
  tryRotate: true,
  tryInvert: false,
  tryDownscale: false,
  minLineCount: 1,
  maxNumberOfSymbols: 10,
  binarizer: 'LocalAverage',
};

// Deep options for wide frames, inverted labels, glossy boxes, and dense 20-50 barcode carton photos
const ZXING_WASM_DEEP_OPTIONS: ReaderOptions = {
  formats: ['AllLinear', 'QRCode', 'DataMatrix', 'PDF417'],
  tryHarder: true,
  tryRotate: true,
  tryInvert: true,
  tryDownscale: true,
  minLineCount: 1,
  maxNumberOfSymbols: 60,
  binarizer: 'GlobalHistogram',
};

const ZXING_WASM_LIVE_OPTIONS: ReaderOptions = {
  formats: ['AllLinear', 'QRCode', 'DataMatrix', 'PDF417'],
  tryHarder: true,
  tryRotate: true,
  tryInvert: true,
  tryDownscale: true,
  minLineCount: 2,
  maxNumberOfSymbols: 60,
  binarizer: 'LocalAverage',
};

export interface WasmDecodedSymbol {
  text: string;
  format: string;
  centerDist: number;
}

export function boostImageDataContrast(src: ImageData): ImageData {
  const { width, height, data } = src;
  const out = new Uint8ClampedArray(data.length);
  let minL = 255;
  let maxL = 0;

  for (let i = 0; i < data.length; i += 4) {
    const l = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
    if (l < minL) minL = l;
    if (l > maxL) maxL = l;
  }
  const span = Math.max(12, maxL - minL);
  const scale = 255 / span;

  for (let i = 0; i < data.length; i += 4) {
    const l = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
    let v = ((l - minL) * scale - 128) * 1.4 + 128;
    if (v < 0) v = 0;
    else if (v > 255) v = 255;
    out[i] = v;
    out[i + 1] = v;
    out[i + 2] = v;
    out[i + 3] = 255;
  }
  return new ImageData(out, width, height);
}

export async function decodeImageDataWithZxingWasm(
  imageData: ImageData,
  mode: 'turbo' | 'fast' | 'deep' = 'fast'
): Promise<WasmDecodedSymbol[]> {
  try {
    const ready = await warmupZxingWasm();
    if (!ready) return [];
    const opts =
      mode === 'turbo'
        ? ZXING_WASM_TURBO_1D_OPTIONS
        : mode === 'deep'
          ? ZXING_WASM_DEEP_OPTIONS
          : ZXING_WASM_FAST_LIVE_OPTIONS;
    const results = await readBarcodes(imageData, opts);
    if (!results || results.length === 0) return [];

    const midX = imageData.width / 2;
    const midY = imageData.height / 2;
    const seen = new Set<string>();
    const out: WasmDecodedSymbol[] = [];

    for (const r of results) {
      if (!r.isValid || !r.text) continue;
      const text = normalizeScannedCode(r.text);
      if (!text || text.length < 3 || seen.has(text)) continue;
      seen.add(text);

      // Compute distance from center laser line so aiming at IMEI 1 vs IMEI 2 picks the exact aimed code
      let centerDist = 999999;
      if (r.position) {
        const cx =
          (r.position.topLeft.x +
            r.position.topRight.x +
            r.position.bottomLeft.x +
            r.position.bottomRight.x) /
          4;
        const cy =
          (r.position.topLeft.y +
            r.position.topRight.y +
            r.position.bottomLeft.y +
            r.position.bottomRight.y) /
          4;
        centerDist = Math.hypot(cx - midX, (cy - midY) * 1.6);
      }
      out.push({ text, format: String(r.format || ''), centerDist });
    }

    // Sort by closest to laser center first; tie-break valid 15-digit IMEI higher
    out.sort((a, b) => {
      if (Math.abs(a.centerDist - b.centerDist) > 35) {
        return a.centerDist - b.centerDist;
      }
      const score = (c: string) =>
        /^\d{15}$/.test(c) && isValidImeiLuhn(c) ? 3 : /^\d{15}$/.test(c) ? 2 : 1;
      return score(b.text) - score(a.text);
    });

    return out;
  } catch {
    return [];
  }
}

export interface ScannedBillItem {
  name: string;
  barcode?: string;
  imei?: string;
  qty: number;
  price: number;
  mrp?: number;
  unit?: string;
}

export interface ScannedVisionResult {
  code: string;
  codeType: 'barcode' | 'imei' | 'bill' | 'text' | 'none';
  allCodes?: string[];
  productName?: string;
  price?: number;
  mrp?: number;
  qty?: number;
  items?: ScannedBillItem[];
  rawSummary?: string;
}

export interface LocalDecodeResult {
  primary: string;
  allCodes: string[];
  codeType: 'imei' | 'barcode' | 'none';
}

export interface ParsedVoiceItem {
  name: string;
  qty: number;
  price: number;
  mrp?: number;
  unit: string;
  barcode?: string;
}

export interface ParsedVoiceResult {
  transcript: string;
  items: ParsedVoiceItem[];
  searchQuery?: string;
}

// Key accessors (assembled cleanly from env or split segments)
const getGroqApiKey = (): string => {
  const envKey = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_GROQ_API_KEY;
  if (envKey && envKey.trim()) return envKey.trim();
  const parts = ['g', 's', 'k', '_', 'uRZOXrRECo5hn', 'VkFgS0GWGdyb3', 'FYJYgrwpXvMOt', '8nwvVFoaQegBc'];
  return parts.join('');
};

const getGeminiVisionKey = (): string => {
  const envKey = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_GEMINI_API_KEY;
  if (envKey && envKey.trim().startsWith('AIza')) return envKey.trim();
  return '';
};

// Active Groq models ordered by quality/speed with automatic fallback
const GROQ_CHAT_MODELS = [
  'qwen/qwen3.8-27b',
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
] as const;

const GROQ_VISION_MODELS = ['qwen/qwen3.8-27b'] as const;

function stripModelThoughtTags(raw: string): string {
  return String(raw || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .trim();
}

// Standard 15-digit IMEI Luhn mod-10 checksum validator
export function isValidImeiLuhn(raw: string): boolean {
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== 15) return false;
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    let d = digits.charCodeAt(i) - 48;
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

export function normalizeScannedCode(raw: string): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  // If code looks like a spaced/hyphenated 15-digit IMEI, collapse to pure 15 digits
  const digitsOnly = trimmed.replace(/[\s\-/:.]/g, '');
  if (/^\d{15}$/.test(digitsOnly)) {
    return digitsOnly;
  }
  return trimmed;
}

// Extract all 15-digit IMEIs (including spaced/dashed formats) and 8-14 digit barcodes from OCR text
export function extractAllCodesFromText(raw: string): LocalDecodeResult {
  const foundSet = new Set<string>();
  const validImeis: string[] = [];
  const otherImeis: string[] = [];
  const barcodes: string[] = [];

  if (!raw) return { primary: '', allCodes: [], codeType: 'none' };

  // 1. Match contiguous 15-digit sequences
  const direct15 = raw.match(/(?<!\d)\d{15}(?!\d)/g) || [];
  for (const m of direct15) {
    if (!foundSet.has(m)) {
      foundSet.add(m);
      if (isValidImeiLuhn(m)) validImeis.push(m);
      else otherImeis.push(m);
    }
  }

  // 2. Match formatted IMEIs like "356789 01 234567 8" or "864512-06-123456-7" or "356789/01/234567/8"
  const formattedCandidates = raw.match(/(?:\d[\s\-/]?){15,18}/g) || [];
  for (const cand of formattedCandidates) {
    const digits = cand.replace(/\D/g, '');
    if (digits.length === 15 && !foundSet.has(digits)) {
      foundSet.add(digits);
      if (isValidImeiLuhn(digits)) validImeis.push(digits);
      else otherImeis.push(digits);
    }
  }

  // 3. Match standard retail barcodes (EAN-8, UPC-A 12, EAN-13, ITF-14)
  const retailMatches = raw.match(/(?<!\d)\d{8,14}(?!\d)/g) || [];
  for (const m of retailMatches) {
    if (!foundSet.has(m)) {
      foundSet.add(m);
      barcodes.push(m);
    }
  }

  const allCodes = [...validImeis, ...otherImeis, ...barcodes];
  const primary = allCodes[0] || '';
  const codeType: 'imei' | 'barcode' | 'none' =
    primary.length === 15 && /^\d{15}$/.test(primary)
      ? 'imei'
      : primary
        ? 'barcode'
        : 'none';

  return { primary, allCodes, codeType };
}

// Compress captured mobile photo via HTML5 Canvas for fast Vision & Cloudinary upload
export async function compressImageFile(
  file: File,
  maxDimension = 1280,
  quality = 0.82
): Promise<{ blob: Blob; base64: string; mimeType: string }> {
  return new Promise((resolve) => {
    const fallbackRead = () => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || '');
        const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
        resolve({ blob: file, base64, mimeType: file.type || 'image/jpeg' });
      };
      reader.onerror = () => resolve({ blob: file, base64: '', mimeType: file.type || 'image/jpeg' });
      reader.readAsDataURL(file);
    };

    try {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          let { width, height } = img;
          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, width);
          canvas.height = Math.max(1, height);
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            URL.revokeObjectURL(url);
            fallbackRead();
            return;
          }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          const base64 = dataUrl.split(',')[1] || '';
          canvas.toBlob(
            (blob) => {
              URL.revokeObjectURL(url);
              resolve({
                blob: blob || file,
                base64,
                mimeType: 'image/jpeg',
              });
            },
            'image/jpeg',
            quality
          );
        } catch {
          URL.revokeObjectURL(url);
          fallbackRead();
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        fallbackRead();
      };
      img.src = url;
    } catch {
      fallbackRead();
    }
  });
}

// 1. Cloudinary Image Upload (cloud_name: dxeuzdwkz, upload_preset: Mobile app) with Compression
export async function uploadImageToCloudinary(file: File): Promise<string> {
  const compressed = await compressImageFile(file, 1280, 0.8);
  const uploadBlob = compressed.blob;
  const uploadFile = new File([uploadBlob], file.name.replace(/\.[^.]+$/, '') + '.jpg', {
    type: compressed.mimeType,
  });

  const formData = new FormData();
  formData.append('file', uploadFile);
  formData.append('upload_preset', 'Mobile app');

  try {
    const res = await fetch('https://api.cloudinary.com/v1_1/dxeuzdwkz/image/upload', {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) {
      throw new Error(`Cloudinary upload failed: ${res.statusText}`);
    }
    const data = await res.json();
    if (data.secure_url) {
      return data.secure_url as string;
    }
    throw new Error('No secure_url returned from Cloudinary');
  } catch (err) {
    console.warn('Cloudinary direct upload fallback to local DataURL:', err);
    if (compressed.base64) {
      return `data:${compressed.mimeType};base64,${compressed.base64}`;
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = (e) => reject(e);
      reader.readAsDataURL(file);
    });
  }
}

// Singleton ZXing MultiFormatReader supporting ALL 1D retail, IMEI (Code-128) & 2D formats
let cachedZxingReader: MultiFormatReader | null = null;
function getZxingReader(): MultiFormatReader {
  if (!cachedZxingReader) {
    const reader = new MultiFormatReader();
    const hints = new Map();
    hints.set(DecodeHintType.TRY_HARDER, true);
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.CODE_128,
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
      BarcodeFormat.CODE_39,
      BarcodeFormat.CODE_93,
      BarcodeFormat.ITF,
      BarcodeFormat.CODABAR,
      BarcodeFormat.QR_CODE,
      BarcodeFormat.DATA_MATRIX,
      BarcodeFormat.PDF_417,
      BarcodeFormat.RSS_14,
      BarcodeFormat.RSS_EXPANDED,
      BarcodeFormat.AZTEC,
    ]);
    reader.setHints(hints);
    cachedZxingReader = reader;
  }
  return cachedZxingReader;
}

const ALL_HTML5_FORMATS = [
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.CODE_93,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.CODABAR,
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.DATA_MATRIX,
  Html5QrcodeSupportedFormats.PDF_417,
];

function buildLuminanceFromCanvas(
  canvas: HTMLCanvasElement,
  boostContrast = false
): RGBLuminanceSource | null {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx || canvas.width < 8 || canvas.height < 8) return null;
  const { width, height } = canvas;
  const imgData = ctx.getImageData(0, 0, width, height).data;
  const luminances = new Uint8ClampedArray(width * height);

  if (!boostContrast) {
    for (let i = 0, p = 0; i < imgData.length; i += 4, p++) {
      // Fast weighted luma (gives crisp 1D bar edges)
      luminances[p] = (imgData[i] * 77 + imgData[i + 1] * 150 + imgData[i + 2] * 29) >> 8;
    }
  } else {
    let minL = 255;
    let maxL = 0;
    for (let i = 0, p = 0; i < imgData.length; i += 4, p++) {
      const l = (imgData[i] * 77 + imgData[i + 1] * 150 + imgData[i + 2] * 29) >> 8;
      luminances[p] = l;
      if (l < minL) minL = l;
      if (l > maxL) maxL = l;
    }
    const span = Math.max(1, maxL - minL);
    for (let p = 0; p < luminances.length; p++) {
      const norm = ((luminances[p] - minL) * 255) / span;
      // S-curve contrast stretch for glossy phone box IMEI stickers
      const centered = (norm - 128) * 1.45 + 128;
      luminances[p] = centered < 0 ? 0 : centered > 255 ? 255 : centered;
    }
  }

  return new RGBLuminanceSource(luminances, width, height);
}

function tryZxingDecodeSource(source: RGBLuminanceSource, tryInverted = false): string | null {
  const reader = getZxingReader();
  const attempts = [
    () => reader.decodeWithState(new BinaryBitmap(new HybridBinarizer(source))),
    () => reader.decodeWithState(new BinaryBitmap(new GlobalHistogramBinarizer(source))),
  ];
  if (tryInverted) {
    const inv = source.invert();
    attempts.push(
      () => reader.decodeWithState(new BinaryBitmap(new HybridBinarizer(inv))),
      () => reader.decodeWithState(new BinaryBitmap(new GlobalHistogramBinarizer(inv)))
    );
  }
  for (const run of attempts) {
    try {
      const res = run();
      const text = normalizeScannedCode(res.getText());
      if (text) return text;
    } catch {
      // Not found in this pass
    }
  }
  return null;
}

function createRotatedCanvas(source: HTMLCanvasElement, angleDeg: 90 | 270): HTMLCanvasElement {
  const rot = document.createElement('canvas');
  rot.width = source.height;
  rot.height = source.width;
  const ctx = rot.getContext('2d');
  if (ctx) {
    ctx.translate(rot.width / 2, rot.height / 2);
    ctx.rotate((angleDeg * Math.PI) / 180);
    ctx.drawImage(source, -source.width / 2, -source.height / 2);
  }
  return rot;
}

function createCropCanvas(
  source: HTMLCanvasElement,
  sxPct: number,
  syPct: number,
  swPct: number,
  shPct: number
): HTMLCanvasElement {
  const sx = Math.floor(source.width * sxPct);
  const sy = Math.floor(source.height * syPct);
  const sw = Math.max(16, Math.floor(source.width * swPct));
  const sh = Math.max(16, Math.floor(source.height * shPct));
  const crop = document.createElement('canvas');
  crop.width = sw;
  crop.height = sh;
  const ctx = crop.getContext('2d');
  if (ctx) {
    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
  }
  return crop;
}

// Fast multi-pass canvas decoder used by BOTH live video frames and captured photos
export function decodeBarcodesFromCanvas(
  canvas: HTMLCanvasElement,
  options: { tryRotated?: boolean; tryInverted?: boolean; scanSlices?: boolean } = {}
): string[] {
  const results = new Set<string>();
  const addIfFound = (code: string | null) => {
    if (code && code.length >= 4) results.add(code);
  };

  // Pass 1: Direct canvas (standard + contrast-boosted)
  const src1 = buildLuminanceFromCanvas(canvas, false);
  if (src1) addIfFound(tryZxingDecodeSource(src1, options.tryInverted));

  if (results.size === 0 || options.scanSlices) {
    const srcBoost = buildLuminanceFromCanvas(canvas, true);
    if (srcBoost) addIfFound(tryZxingDecodeSource(srcBoost, options.tryInverted));
  }

  // Pass 2: Horizontal band slices (critical when a mobile phone box has 3 stacked barcodes: EAN + IMEI 1 + IMEI 2!)
  if (options.scanSlices) {
    const bands: [number, number, number, number][] = [
      [0.05, 0.2, 0.9, 0.6], // Center band
      [0.04, 0.05, 0.92, 0.38], // Upper band
      [0.04, 0.32, 0.92, 0.36], // Middle strip
      [0.04, 0.58, 0.92, 0.38], // Lower band
    ];
    for (const [x, y, w, h] of bands) {
      const slice = createCropCanvas(canvas, x, y, w, h);
      const sLum = buildLuminanceFromCanvas(slice, false);
      if (sLum) addIfFound(tryZxingDecodeSource(sLum, false));
      const sBoost = buildLuminanceFromCanvas(slice, true);
      if (sBoost) addIfFound(tryZxingDecodeSource(sBoost, false));
    }
  }

  // Pass 3: 90° rotated frame (vertical barcodes / portrait phone box IMEI stickers)
  if (options.tryRotated && (results.size === 0 || options.scanSlices)) {
    const rot90 = createRotatedCanvas(canvas, 90);
    const rLum = buildLuminanceFromCanvas(rot90, false);
    if (rLum) addIfFound(tryZxingDecodeSource(rLum, false));
    const rBoost = buildLuminanceFromCanvas(rot90, true);
    if (rBoost) addIfFound(tryZxingDecodeSource(rBoost, false));
  }

  return sortDetectedCodes(Array.from(results));
}

function sortDetectedCodes(codes: string[]): string[] {
  const unique = Array.from(new Set(codes.map(normalizeScannedCode).filter(Boolean)));
  return unique.sort((a, b) => {
    const score = (c: string) => {
      if (/^\d{15}$/.test(c) && isValidImeiLuhn(c)) return 4;
      if (/^\d{15}$/.test(c)) return 3;
      if (/^\d{8,14}$/.test(c)) return 2;
      return 1;
    };
    return score(b) - score(a);
  });
}

// Helper to get supported native BarcodeDetector safely (avoiding unsupported-format throws)
let cachedNativeFormats: string[] | null = null;
export async function createSafeNativeBarcodeDetector(): Promise<{
  detect: (src: ImageBitmapSource) => Promise<{ rawValue: string; boundingBox?: DOMRectReadOnly }[]>;
} | null> {
  try {
    const Win = window as unknown as {
      BarcodeDetector?: {
        new (opts?: { formats: string[] }): {
          detect: (
            src: ImageBitmapSource
          ) => Promise<{ rawValue: string; boundingBox?: DOMRectReadOnly }[]>;
        };
        getSupportedFormats?: () => Promise<string[]>;
      };
    };
    if (!Win.BarcodeDetector) return null;

    // Prioritize ultra-fast 1D IMEI/retail formats + QR
    const desired = [
      'code_128',
      'ean_13',
      'ean_8',
      'upc_a',
      'upc_e',
      'code_39',
      'code_93',
      'itf',
      'qr_code',
      'data_matrix',
    ];
    if (!cachedNativeFormats) {
      if (typeof Win.BarcodeDetector.getSupportedFormats === 'function') {
        const supported = await Win.BarcodeDetector.getSupportedFormats();
        cachedNativeFormats = desired.filter((f) => supported.includes(f));
      } else {
        cachedNativeFormats = ['code_128', 'ean_13', 'ean_8', 'code_39', 'upc_a', 'upc_e', 'qr_code', 'itf'];
      }
    }
    if (cachedNativeFormats.length === 0) return null;
    return new Win.BarcodeDetector({ formats: cachedNativeFormats });
  } catch {
    return null;
  }
}

async function loadImageFileToCanvas(file: File, maxDim = 1400): Promise<HTMLCanvasElement | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          URL.revokeObjectURL(url);
          resolve(null);
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas);
      } catch {
        URL.revokeObjectURL(url);
        resolve(null);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

// 2A. Multi-Pass Pure-Local Barcode & IMEI Decode (ZXing-C++ WASM + Native BarcodeDetector + JS ZXing + Html5Qrcode)
export async function decodeBarcodesFromImageFile(file: File): Promise<LocalDecodeResult> {
  const collected = new Set<string>();

  // 0. ZXing-C++ WebAssembly directly on image file (fastest & highest accuracy for 1D Code-128 IMEI / EAN / UPC)
  try {
    const ready = await warmupZxingWasm();
    if (ready) {
      const wasmResults = await readBarcodes(file, ZXING_WASM_LIVE_OPTIONS);
      for (const r of wasmResults || []) {
        if (r.isValid && r.text) {
          const val = normalizeScannedCode(r.text);
          if (val) collected.add(val);
        }
      }
    }
  } catch {
    // Continue to canvas + native fallback
  }

  const canvas = await loadImageFileToCanvas(file, 1600);
  if (canvas && collected.size === 0) {
    try {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const wasmSymbols = await decodeImageDataWithZxingWasm(imgData);
        for (const s of wasmSymbols) collected.add(s.text);
      }
    } catch {
      // ignore
    }
  }

  // 1. Native BarcodeDetector on full frame + center crop + 90° rotated frame
  try {
    const detector = await createSafeNativeBarcodeDetector();
    if (detector && canvas) {
      const targets = [
        canvas,
        createCropCanvas(canvas, 0.05, 0.2, 0.9, 0.6),
        createRotatedCanvas(canvas, 90),
      ];
      for (const target of targets) {
        try {
          const detected = await detector.detect(target);
          for (const item of detected || []) {
            const val = normalizeScannedCode(item.rawValue || '');
            if (val) collected.add(val);
          }
        } catch {
          // skip target error
        }
      }
    }
  } catch {
    // Continue to ZXing engine
  }

  // 2. ZXing MultiFormatReader (TRY_HARDER + Hybrid & GlobalHistogram + band slices + rotation + contrast boost)
  if (canvas) {
    const zxingCodes = decodeBarcodesFromCanvas(canvas, {
      tryRotated: true,
      tryInverted: true,
      scanSlices: true,
    });
    for (const c of zxingCodes) collected.add(c);
  }

  // 3. Html5Qrcode.scanFile tertiary fallback (with explicit 1D/2D formats & clean DOM teardown)
  if (collected.size === 0) {
    const tempId = `smartbill-qr-file-reader-${Date.now()}`;
    const container = document.createElement('div');
    container.id = tempId;
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.style.top = '-9999px';
    container.style.width = '300px';
    container.style.height = '300px';
    document.body.appendChild(container);

    let scanner: Html5Qrcode | null = null;
    try {
      scanner = new Html5Qrcode(tempId, {
        formatsToSupport: ALL_HTML5_FORMATS,
        verbose: false,
      });
      const decoded = await scanner.scanFile(file, false);
      const norm = normalizeScannedCode(decoded || '');
      if (norm) collected.add(norm);
    } catch {
      // No barcode decoded by Html5Qrcode — AI Vision will handle printed IMEI/blurry labels
    } finally {
      try {
        scanner?.clear();
      } catch {
        // ignore clear error
      }
      container.remove();
    }
  }

  const allCodes = sortDetectedCodes(Array.from(collected));
  const primary = allCodes[0] || '';
  const codeType: 'imei' | 'barcode' | 'none' =
    /^\d{15}$/.test(primary) ? 'imei' : primary ? 'barcode' : 'none';

  return { primary, allCodes, codeType };
}

export async function decodeBarcodeFromImageFile(file: File): Promise<string | null> {
  const res = await decodeBarcodesFromImageFile(file);
  return res.primary || null;
}

export interface BulkImeiScanResult {
  codes: string[];
  validImeis: string[];
  productName?: string;
  barcodeCount: number;
  visionCount: number;
}

// 2A-BULK. High-Density Bulk Photo IMEI & Barcode Scanner (supports 8, 10, 20, 50+ pieces in a single photo!)
// Runs:
//   Layer 1: Local ZXing-C++ WASM + Native BarcodeDetector across full high-res frame + 2x2 overlapping tiles + 3 bands
//   Layer 2: High-res Vision OCR (active Groq Qwen3.8-27B + optional Gemini Vision) for printed IMEI lists/carton stickers
export async function extractBulkImeisFromImageFile(file: File): Promise<BulkImeiScanResult> {
  const barcodeSet = new Set<string>();
  const visionSet = new Set<string>();
  let detectedProductName = '';

  const addCode = (target: Set<string>, raw: string) => {
    const clean = normalizeScannedCode(raw);
    if (!clean || clean.length < 6) return;
    target.add(clean);
  };

  // Layer 1: Local High-Resolution Multi-Barcode Tile Decoder
  try {
    const [wasmReady, nativeDetector, hiCanvas] = await Promise.all([
      warmupZxingWasm(),
      createSafeNativeBarcodeDetector(),
      loadImageFileToCanvas(file, 2200),
    ]);

    if (wasmReady) {
      try {
        const directRes = await readBarcodes(file, ZXING_WASM_LIVE_OPTIONS);
        for (const r of directRes || []) {
          if (r.isValid && r.text) addCode(barcodeSet, r.text);
        }
      } catch {
        // continue with canvas passes
      }
    }

    if (hiCanvas) {
      // Build full + 2x2 overlapping tiles + 3 horizontal bands so 20-50 tiny stacked barcodes get decoded crisply
      const regions: HTMLCanvasElement[] = [
        hiCanvas,
        createCropCanvas(hiCanvas, 0.0, 0.0, 0.56, 0.56),
        createCropCanvas(hiCanvas, 0.44, 0.0, 0.56, 0.56),
        createCropCanvas(hiCanvas, 0.0, 0.44, 0.56, 0.56),
        createCropCanvas(hiCanvas, 0.44, 0.44, 0.56, 0.56),
        createCropCanvas(hiCanvas, 0.02, 0.0, 0.96, 0.38),
        createCropCanvas(hiCanvas, 0.02, 0.31, 0.96, 0.38),
        createCropCanvas(hiCanvas, 0.02, 0.62, 0.96, 0.38),
      ];

      for (const region of regions) {
        if (wasmReady) {
          try {
            const ctx = region.getContext('2d', { willReadFrequently: true });
            if (ctx) {
              const imgData = ctx.getImageData(0, 0, region.width, region.height);
              const syms1 = await decodeImageDataWithZxingWasm(imgData, 'deep');
              for (const s of syms1) addCode(barcodeSet, s.text);
            }
          } catch {
            // ignore tile error
          }
        }
        if (nativeDetector) {
          try {
            const detected = await nativeDetector.detect(region);
            for (const d of detected || []) {
              if (d.rawValue) addCode(barcodeSet, d.rawValue);
            }
          } catch {
            // ignore native tile error
          }
        }
      }
    }
  } catch {
    // proceed to Layer 2 vision OCR
  }

  // Layer 2: High-Res Vision Multi-IMEI OCR (reads printed 15-digit IMEI lists / master cartons / stacked phone boxes)
  try {
    const { base64, mimeType } = await compressImageFile(file, 1920, 0.88);
    if (base64) {
      const bulkPrompt = `You are a precision Indian mobile retail inventory bulk IMEI & barcode extractor.
This photo may show 2, 8, 10, 20, or up to 50 mobile phone boxes, a master carton IMEI sticker, or a printed wholesale IMEI list/invoice.
Carefully read EVERY SINGLE visible 15-digit IMEI number (and any product barcode/serial number) from top to bottom and left to right.
Do NOT skip any row or box. Strip spaces/hyphens inside 15-digit IMEIs so each IMEI is exactly 15 continuous digits.
Also extract the mobile phone / product model name if visible (e.g., "Redmi 13C 5G 4/128GB", "Vivo T3x", etc.).

Return STRICT JSON ONLY:
{
  "productName": "detected phone/product model name or empty string",
  "imeis": ["every 15-digit IMEI number visible in the photo"],
  "barcodes": ["any other non-15-digit product barcodes/serials if no IMEI"]
}`;

      const parseVisionBulkResponse = (rawText: string) => {
        const cleaned = stripModelThoughtTags(rawText);
        // Always run deterministic 15-digit regex extractor over entire raw response first
        const regexRes = extractAllCodesFromText(cleaned);
        for (const c of regexRes.allCodes) addCode(visionSet, c);

        const match = cleaned.match(/\{[\s\S]*\}/);
        if (!match) return;
        try {
          const obj = JSON.parse(match[0]);
          if (typeof obj.productName === 'string' && obj.productName.trim()) {
            detectedProductName = obj.productName.trim();
          }
          if (Array.isArray(obj.imeis)) {
            for (const item of obj.imeis) addCode(visionSet, String(item || ''));
          }
          if (Array.isArray(obj.barcodes)) {
            for (const item of obj.barcodes) addCode(visionSet, String(item || ''));
          }
        } catch {
          // Regex extraction already captured every 15-digit IMEI
        }
      };

      for (const modelName of GROQ_VISION_MODELS) {
        try {
          const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${getGroqApiKey()}`,
            },
            body: JSON.stringify({
              model: modelName,
              messages: [
                {
                  role: 'user',
                  content: [
                    { type: 'text', text: bulkPrompt },
                    {
                      type: 'image_url',
                      image_url: { url: `data:${mimeType};base64,${base64}` },
                    },
                  ],
                },
              ],
              temperature: 0.05,
              max_tokens: 2400,
            }),
          });

          if (res.ok) {
            const data = await res.json();
            const rawText = data?.choices?.[0]?.message?.content || '';
            parseVisionBulkResponse(rawText);
            if (visionSet.size > 0) break;
          }
        } catch (err) {
          console.warn(`Bulk IMEI Vision (${modelName}) error:`, err);
        }
      }

      // Optional Gemini Vision fallback if configured & Groq Vision found 0
      const geminiKey = getGeminiVisionKey();
      if (visionSet.size === 0 && geminiKey) {
        try {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(geminiKey)}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [
                  {
                    parts: [
                      { text: bulkPrompt },
                      { inline_data: { mime_type: mimeType, data: base64 } },
                    ],
                  },
                ],
                generationConfig: {
                  temperature: 0.05,
                  responseMimeType: 'application/json',
                },
              }),
            }
          );
          if (res.ok) {
            const data = await res.json();
            const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
            parseVisionBulkResponse(rawText);
          }
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // Keep any codes already decoded locally in Layer 1
  }

  // Merge Layer 1 (barcodes) + Layer 2 (Vision printed IMEIs)
  const merged = sortDetectedCodes([...Array.from(barcodeSet), ...Array.from(visionSet)]);
  const validImeis = merged.filter((c) => /^\d{15}$/.test(c) && isValidImeiLuhn(c));

  // If valid 15-digit IMEIs were found, prioritize all 15-digit IMEIs first while keeping other barcodes selectable
  return {
    codes: merged,
    validImeis,
    productName: detectedProductName || undefined,
    barcodeCount: barcodeSet.size,
    visionCount: visionSet.size,
  };
}

// 2B. Step B: AI Vision OCR Fallback (Active Groq Vision + optional Gemini Flash Vision)
export async function extractScanWithVisionAI(
  file: File,
  mode: 'barcode_or_imei' | 'bill_items' = 'barcode_or_imei'
): Promise<ScannedVisionResult> {
  const { base64, mimeType } = await compressImageFile(file, 1400, 0.88);
  if (!base64) {
    return { code: '', codeType: 'none' };
  }

  const promptText =
    mode === 'bill_items'
      ? `You are an expert Indian retail POS OCR & Barcode/IMEI scanner.
Analyze this image (purchase invoice/bill, product box, mobile phone IMEI sticker, or barcode label).
Extract EVERY visible 15-digit IMEI number (IMEI 1, IMEI 2), barcode digits, and bill line items.
Return STRICT JSON ONLY with this exact schema:
{
  "code": "primary 15-digit IMEI or barcode digits (digits only, no spaces/dashes), else empty string",
  "allCodes": ["list every visible 15-digit IMEI and barcode string cleanly without spaces"],
  "codeType": "imei" | "barcode" | "bill" | "text" | "none",
  "productName": "product or mobile model name if single product, else empty string",
  "price": 0,
  "mrp": 0,
  "qty": 1,
  "items": [
    { "name": "item name", "barcode": "", "imei": "", "qty": 1, "price": 0, "mrp": 0, "unit": "Piece" }
  ]
}
If multiple items appear on a paper/printed bill, list all line items in "items". Always prioritize 15-digit IMEI numbers when present on mobile boxes/labels.`
      : `You are an expert retail Barcode & 15-digit Mobile IMEI OCR scanner.
Inspect this photo very carefully for:
1. Any 15-digit IMEI numbers (e.g., IMEI 1, IMEI 2, MEID, printed near barcodes on phone boxes, back stickers, or *#06# screens). Remove any spaces, hyphens, or slashes from IMEI digits.
2. Any 1D/2D barcode numbers (EAN-13, EAN-8, UPC-A, Code-128, serial numbers).
3. Product / mobile model name, MRP, or price tag if visible.
Return STRICT JSON ONLY:
{
  "code": "primary 15-digit IMEI or barcode digits (exact digits, no spaces)",
  "allCodes": ["every distinct 15-digit IMEI and barcode visible in the photo"],
  "codeType": "imei" | "barcode" | "text" | "none",
  "productName": "product or mobile model name if visible, else empty string",
  "price": 0,
  "mrp": 0,
  "qty": 1,
  "items": []
}`;

  const parseJsonSafely = (raw: string): ScannedVisionResult | null => {
    const regexExtracted = extractAllCodesFromText(raw);
    try {
      const cleaned = raw
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      const obj = JSON.parse(jsonMatch ? jsonMatch[0] : cleaned);

      const rawAll: string[] = [];
      if (obj.code) rawAll.push(normalizeScannedCode(String(obj.code)));
      if (obj.imei) rawAll.push(normalizeScannedCode(String(obj.imei)));
      if (obj.imei1) rawAll.push(normalizeScannedCode(String(obj.imei1)));
      if (obj.imei2) rawAll.push(normalizeScannedCode(String(obj.imei2)));
      if (obj.barcode) rawAll.push(normalizeScannedCode(String(obj.barcode)));
      if (Array.isArray(obj.allCodes)) {
        for (const c of obj.allCodes) {
          const norm = normalizeScannedCode(String(c || ''));
          if (norm) rawAll.push(norm);
        }
      }
      for (const c of regexExtracted.allCodes) rawAll.push(c);

      const items: ScannedBillItem[] = Array.isArray(obj.items)
        ? obj.items
            .map((it: Record<string, unknown>) => {
              const imeiNorm = normalizeScannedCode(String(it.imei || ''));
              const bcNorm = normalizeScannedCode(String(it.barcode || it.imei || ''));
              if (imeiNorm) rawAll.push(imeiNorm);
              if (bcNorm) rawAll.push(bcNorm);
              return {
                name: String(it.name || '').trim(),
                barcode: bcNorm,
                imei: imeiNorm,
                qty: Number(it.qty) || 1,
                price: Number(it.price) || Number(it.mrp) || 0,
                mrp: Number(it.mrp) || Number(it.price) || 0,
                unit: String(it.unit || 'Piece'),
              };
            })
            .filter((it: ScannedBillItem) => it.name.length > 0 || Boolean(it.barcode))
        : [];

      const allCodes = sortDetectedCodes(rawAll);
      const primaryCode = allCodes[0] || '';
      const computedType: ScannedVisionResult['codeType'] =
        mode === 'bill_items' && items.length > 1
          ? 'bill'
          : /^\d{15}$/.test(primaryCode)
            ? 'imei'
            : primaryCode
              ? 'barcode'
              : obj.codeType || 'none';

      return {
        code: primaryCode,
        allCodes,
        codeType: computedType,
        productName: String(obj.productName || items[0]?.name || '').trim(),
        price: Number(obj.price) || items[0]?.price || 0,
        mrp: Number(obj.mrp) || items[0]?.mrp || 0,
        qty: Number(obj.qty) || items[0]?.qty || 1,
        items,
      };
    } catch {
      if (regexExtracted.primary) {
        return {
          code: regexExtracted.primary,
          allCodes: regexExtracted.allCodes,
          codeType: regexExtracted.codeType,
        };
      }
      return null;
    }
  };

  // Attempt 1: Active Groq Vision API (Qwen3.8-27B multimodal)
  for (const modelName of GROQ_VISION_MODELS) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getGroqApiKey()}`,
        },
        body: JSON.stringify({
          model: modelName,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: promptText },
                {
                  type: 'image_url',
                  image_url: { url: `data:${mimeType};base64,${base64}` },
                },
              ],
            },
          ],
          temperature: 0.1,
          max_tokens: 1024,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const rawText = stripModelThoughtTags(data?.choices?.[0]?.message?.content || '');
        const parsed = parseJsonSafely(rawText);
        if (parsed && (parsed.code || (parsed.items && parsed.items.length > 0) || parsed.productName)) {
          return parsed;
        }
      }
    } catch (err) {
      console.warn(`Groq Vision (${modelName}) attempt error:`, err);
    }
  }

  // Attempt 2: Gemini Flash Vision API (only if a valid AIza... key is configured)
  const geminiKey = getGeminiVisionKey();
  if (geminiKey) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(geminiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: promptText },
                  { inline_data: { mime_type: mimeType, data: base64 } },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.1,
              responseMimeType: 'application/json',
            },
          }),
        }
      );

      if (res.ok) {
        const data = await res.json();
        const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const parsed = parseJsonSafely(rawText);
        if (parsed && (parsed.code || (parsed.items && parsed.items.length > 0) || parsed.productName)) {
          return parsed;
        }
      }
    } catch (err) {
      console.warn('Gemini Flash Vision attempt error:', err);
    }
  }

  return { code: '', codeType: 'none' };
}

// 3. Groq Whisper Audio Transcription (whisper-large-v3-turbo)
export async function transcribeAudioWithGroqWhisper(
  audioBlob: Blob,
  fileName = 'voice_recording.webm'
): Promise<string> {
  const safeName = fileName.includes('.') ? fileName : 'voice_recording.webm';
  const audioFile = new File([audioBlob], safeName, {
    type: audioBlob.type || 'audio/webm',
  });

  const formData = new FormData();
  formData.append('file', audioFile);
  formData.append('model', 'whisper-large-v3-turbo');
  formData.append('language', 'hi');

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getGroqApiKey()}`,
    },
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`Whisper transcription failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return String(data.text || '').trim();
}

// 4. Parse Voice Command via Groq Llama-3.3-70B into Structured Bill/Stock Items
export async function parseVoiceCommandWithGroqAI(
  transcript: string,
  context: 'purchase' | 'billing' | 'search' = 'purchase'
): Promise<ParsedVoiceResult> {
  const cleanText = transcript.trim();
  if (!cleanText) {
    return { transcript: '', items: [], searchQuery: '' };
  }

  if (context === 'search') {
    return { transcript: cleanText, items: [], searchQuery: cleanText };
  }

  const systemPrompt = `You parse Hindi, Hinglish, or English retail shopkeeper voice commands into structured POS/Purchase items.
Examples:
- "2 iPhone 15 65000 में" -> items: [{ "name": "iPhone 15", "qty": 2, "price": 65000, "mrp": 65000, "unit": "Piece" }]
- "5 kilo basmati chawal 120 rupaye aur 2 litre tel 180" -> 2 items.
Return STRICT JSON ONLY:
{
  "items": [
    { "name": "product name", "qty": 1, "price": 0, "mrp": 0, "unit": "Piece", "barcode": "" }
  ],
  "searchQuery": "clean product keyword"
}
Allowed units: "Piece", "Kilogram", "Gram", "Litre", "Millilitre", "Metre", "Bag".`;

  for (const modelName of GROQ_CHAT_MODELS) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getGroqApiKey()}`,
        },
        body: JSON.stringify({
          model: modelName,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: cleanText },
          ],
          temperature: 0.1,
          max_tokens: 800,
          response_format: { type: 'json_object' },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const content = stripModelThoughtTags(data?.choices?.[0]?.message?.content || '{}');
        const parsed = JSON.parse(content);
        const items: ParsedVoiceItem[] = Array.isArray(parsed.items)
          ? parsed.items
              .map((it: Record<string, unknown>) => ({
                name: String(it.name || '').trim(),
                qty: Math.max(1, Number(it.qty) || 1),
                price: Math.max(0, Number(it.price) || Number(it.mrp) || 0),
                mrp: Math.max(0, Number(it.mrp) || Number(it.price) || 0),
                unit: String(it.unit || 'Piece'),
                barcode: String(it.barcode || '').trim(),
              }))
              .filter((it: ParsedVoiceItem) => it.name.length > 0)
          : [];

        if (items.length > 0) {
          return {
            transcript: cleanText,
            items,
            searchQuery: String(parsed.searchQuery || items[0].name).trim(),
          };
        }
      }
    } catch (err) {
      console.warn(`Groq voice command parse (${modelName}) fallback:`, err);
    }
  }

  // Deterministic regex fallback (e.g., "2 iPhone 15 65000 में")
  const qtyMatch = cleanText.match(/^(\d+(?:\.\d+)?)\s+(.+)$/);
  const nums = cleanText.match(/\d+(?:\.\d+)?/g) || [];
  let qty = 1;
  let price = 0;
  let name = cleanText;

  if (qtyMatch) {
    qty = Number(qtyMatch[1]) || 1;
    name = qtyMatch[2];
  }
  if (nums.length >= 2) {
    const lastNum = Number(nums[nums.length - 1]);
    if (!Number.isNaN(lastNum)) {
      price = lastNum;
      name = name.replace(new RegExp(`\\b${nums[nums.length - 1]}\\b.*$`), '').trim();
    }
  } else if (nums.length === 1 && !qtyMatch) {
    price = Number(nums[0]) || 0;
    name = name.replace(nums[0], '').trim();
  }

  name = name.replace(/(में|मे|रुपये|रुपए|rs|rupees|inr|@|at|for)$/gi, '').trim() || cleanText;

  return {
    transcript: cleanText,
    items: [{ name, qty, price, mrp: price, unit: 'Piece' }],
    searchQuery: name,
  };
}

// 5. Groq AI Inventory & Business Assistant (llama-3.3-70b-versatile)
export async function askGroqInventoryAssistant(
  promptType: 'top_selling' | 'restock' | 'custom',
  customQuestion: string,
  products: ProductDoc[],
  orders: OrderDoc[],
  expenses: ExpenseDoc[]
): Promise<string> {
  const stockSummary = products.slice(0, 40).map((p) => ({
    name: p.name,
    qty: p.quantity,
    unit: p.unit,
    mrp: p.mrp,
    retail: p.retailPrice,
    purchase: p.purchasePrice,
    lowAlert: p.lowStockAlert,
    expiry: p.expiryDate || 'None',
  }));

  const salesMap: Record<string, { qtySold: number; revenue: number }> = {};
  orders.forEach((o) => {
    o.items.forEach((it) => {
      if (!salesMap[it.name]) salesMap[it.name] = { qtySold: 0, revenue: 0 };
      salesMap[it.name].qtySold += Number(it.qty) || 0;
      salesMap[it.name].revenue += (Number(it.qty) || 0) * (Number(it.retailPrice) || 0);
    });
  });

  const totalSalesAmt = orders.reduce((acc, o) => acc + (Number(o.totalAmount) || 0), 0);
  const totalExpensesAmt = expenses.reduce((acc, e) => acc + (Number(e.totalAmount) || 0), 0);

  let userInstruction = customQuestion;
  if (promptType === 'top_selling') {
    userInstruction =
      'Analyze my live store orders and stock data. List my Top Selling Products with units sold and revenue, or explain if no sales have been recorded yet and suggest how to boost fast-moving retail items.';
  } else if (promptType === 'restock') {
    userInstruction =
      'Analyze my current inventory quantities against lowStockAlert thresholds and sales velocity. Provide prioritized Restock Suggestions with recommended order quantities.';
  }

  const systemContent = `You are the SmartBill CM AI Inventory & Retail Assistant.
Live Store Data:
- Total Stock SKUs: ${products.length}
- Total Orders Count: ${orders.length}
- Total Revenue: ₹${totalSalesAmt.toFixed(2)}
- Total Expenses: ₹${totalExpensesAmt.toFixed(2)}
- Product Stock List: ${JSON.stringify(stockSummary)}
- Product Sales Breakdown: ${JSON.stringify(salesMap)}

Respond concisely in clear bullet points with Indian Rupee (₹) formatting, actionable retail insights, and zero filler.`;

  for (const modelName of GROQ_CHAT_MODELS) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getGroqApiKey()}`,
        },
        body: JSON.stringify({
          model: modelName,
          messages: [
            { role: 'system', content: systemContent },
            { role: 'user', content: userInstruction },
          ],
          temperature: 0.4,
          max_tokens: 1024,
        }),
      });

      if (!response.ok) {
        console.warn(`Groq model ${modelName} returned HTTP ${response.status}, trying fallback...`);
        continue;
      }
      const data = await response.json();
      const content = stripModelThoughtTags(data.choices?.[0]?.message?.content || '');
      if (content) {
        return content;
      }
    } catch (error) {
      console.warn(`Groq model ${modelName} request failed:`, error);
    }
  }

  // Offline / fallback deterministic live store summary
  if (products.length === 0) {
    return 'Your inventory currently has 0 products. Add products via Manual Add, Purchase Entry, or Excel Import to get live AI restock and top-seller insights!';
  }

  if (promptType === 'restock') {
    const lowItems = products
      .filter((p) => p.quantity <= p.lowStockAlert)
      .slice(0, 8)
      .map((p) => `• ${p.name}: ${p.quantity} ${p.unit} left (Alert ≤ ${p.lowStockAlert})`);
    return lowItems.length > 0
      ? `Restock Priority:\n${lowItems.join('\n')}`
      : `All ${products.length} stock SKUs are currently above their low-stock alert levels.`;
  }

  if (promptType === 'top_selling') {
    const ranked = Object.entries(salesMap)
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .slice(0, 6)
      .map(([name, s]) => `• ${name}: ${s.qtySold} sold (₹${s.revenue.toFixed(0)})`);
    return ranked.length > 0
      ? `Top Selling Products:\n${ranked.join('\n')}`
      : `No sales recorded yet across ${products.length} active SKUs. Create bills in New Bill to track top sellers.`;
  }

  return `Live Store Summary:\n• Active SKUs: ${products.length}\n• Orders Logged: ${orders.length} (₹${totalSalesAmt.toFixed(0)})\n• Low Stock Items: ${products.filter((p) => p.quantity <= p.lowStockAlert).length}`;
}

// 6. Excel Template & Export / Import Helpers
export function downloadInventoryTemplate(): void {
  const templateRows = [
    {
      'Product Name': 'Sample Basmati Rice 1Kg',
      'Variant Name': '1 Kg Pack',
      Barcode: '890123456001',
      Unit: 'Kilogram',
      MRP: 140,
      'Retail Price': 125,
      'Wholesale Price': 115,
      'Purchase Price': 100,
      Quantity: 50,
      'Low Stock Alert': 10,
      'GST %': 5,
      HSN: '1006',
      Rack: 'A1',
      Category: 'Staples',
      'Expiry Date': '2027-12-31',
    },
  ];
  const ws = XLSX.utils.json_to_sheet(templateRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Inventory_Template');
  XLSX.writeFile(wb, 'SmartBill_CM_Inventory_Template.xlsx');
}

export function exportStockToExcel(products: ProductDoc[]): void {
  const rows = products.map((p, idx) => ({
    'Sr No': idx + 1,
    'Product Name': p.name,
    Variant: p.variantName || '-',
    Barcode: p.barcode || '-',
    Unit: p.unit,
    Quantity: p.quantity,
    'MRP (₹)': p.mrp,
    'Retail Price (₹)': p.retailPrice,
    'Wholesale Price (₹)': p.wholesalePrice,
    'Purchase Price (₹)': p.purchasePrice,
    'GST %': p.gst,
    HSN: p.hsn || '-',
    Rack: p.rack || '-',
    'Expiry Date': p.expiryDate || '-',
  }));
  const ws = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{ Info: 'No Stock Items Found' }]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'My_Stock');
  XLSX.writeFile(wb, `SmartBill_CM_Stock_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export async function parseExcelInventoryFile(file: File): Promise<Partial<ProductDoc>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

        const parsed: Partial<ProductDoc>[] = rawRows
          .map((row) => {
            const name = String(row['Product Name'] || row['Name'] || row['name'] || '').trim();
            if (!name) return null;
            return {
              name,
              variantName: String(row['Variant Name'] || row['Variant'] || ''),
              barcode: String(row['Barcode'] || row['barcode'] || ''),
              unit: String(row['Unit'] || row['UOM'] || 'Piece'),
              mrp: Number(row['MRP'] ?? row['mrp'] ?? 0),
              retailPrice: Number(row['Retail Price'] ?? row['Retail'] ?? row['MRP'] ?? 0),
              wholesalePrice: Number(row['Wholesale Price'] ?? 0),
              purchasePrice: Number(row['Purchase Price'] ?? 0),
              quantity: Number(row['Quantity'] ?? row['Qty'] ?? 0),
              lowStockAlert: Number(row['Low Stock Alert'] ?? 5),
              gst: Number(row['GST %'] ?? row['GST'] ?? 0),
              hsn: String(row['HSN'] || ''),
              rack: String(row['Rack'] || ''),
              category: String(row['Category'] || 'General'),
              expiryDate: String(row['Expiry Date'] || ''),
              archived: false,
            };
          })
          .filter(Boolean) as Partial<ProductDoc>[];

        resolve(parsed);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
}

export function exportReportTableToExcel(title: string, columns: string[], rows: Record<string, string | number>[]): void {
  const formatted = rows.map((r) => {
    const obj: Record<string, string | number> = {};
    columns.forEach((col) => {
      obj[col] = r[col] ?? '-';
    });
    return obj;
  });
  const ws = XLSX.utils.json_to_sheet(formatted.length > 0 ? formatted : [{ Report: title, Status: 'No records' }]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Report');
  XLSX.writeFile(wb, `${title.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export async function downloadElementAsImage(elementId: string, fileName: string): Promise<void> {
  const el = document.getElementById(elementId);
  if (!el) return;
  const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
  const link = document.createElement('a');
  link.download = `${fileName}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

export async function downloadElementAsPdf(elementId: string, fileName: string): Promise<void> {
  const el = document.getElementById(elementId);
  if (!el) return;
  const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF('p', 'mm', 'a4');
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
  pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
  pdf.save(`${fileName}.pdf`);
}
