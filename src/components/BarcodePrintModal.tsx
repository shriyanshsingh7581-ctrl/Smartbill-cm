import React, { useMemo, useState } from 'react';
import { X, Printer, Download, Check, QrCode, Barcode as BarcodeIcon } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { downloadElementAsPdf } from '../services/integrations';

interface BarcodePrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  productName: string;
  price: number;
  mrp?: number;
  codes: string[];
  shopName?: string;
}

// Authentic Code 128B encoding patterns (values 0..106)
const CODE128_PATTERNS: string[] = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];

function encodeCode128B(text: string): { bars: { x: number; w: number }[]; width: number } {
  const clean = text.replace(/[^\x20-\x7E]/g, '').slice(0, 32) || '0000';
  const values: number[] = [104]; // Start Code B
  let checksum = 104;
  for (let i = 0; i < clean.length; i++) {
    const val = clean.charCodeAt(i) - 32;
    if (val >= 0 && val <= 94) {
      values.push(val);
      checksum += val * (i + 1);
    }
  }
  values.push(checksum % 103);
  values.push(106); // Stop pattern

  const bars: { x: number; w: number }[] = [];
  let cursor = 10; // Quiet zone left
  for (const val of values) {
    const pattern = CODE128_PATTERNS[val] || CODE128_PATTERNS[0];
    for (let j = 0; j < pattern.length; j++) {
      const w = Number(pattern[j]);
      if (j % 2 === 0) {
        bars.push({ x: cursor, w });
      }
      cursor += w;
    }
  }
  return { bars, width: cursor + 10 };
}

const Code128Svg: React.FC<{ value: string; height?: number }> = ({ value, height = 42 }) => {
  const { bars, width } = useMemo(() => encodeCode128B(value), [value]);
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-11 max-w-[200px] mx-auto"
      preserveAspectRatio="none"
      aria-label={`Barcode ${value}`}
    >
      <rect x="0" y="0" width={width} height={height} fill="#ffffff" />
      {bars.map((b, idx) => (
        <rect key={idx} x={b.x} y={0} width={b.w} height={height} fill="#0f172a" />
      ))}
    </svg>
  );
};

export const BarcodePrintModal: React.FC<BarcodePrintModalProps> = ({
  isOpen,
  onClose,
  productName,
  price,
  mrp,
  codes,
  shopName,
}) => {
  const [selectedCodes, setSelectedCodes] = useState<string[]>(codes);
  const [format, setFormat] = useState<'barcode' | 'qr'>('barcode');
  const [downloading, setDownloading] = useState(false);

  const codesKey = codes.join('\u0000');

  // Sync selected codes when modal opens or actual code contents change
  React.useEffect(() => {
    if (isOpen) {
      setSelectedCodes(codesKey ? codesKey.split('\u0000') : []);
    }
  }, [isOpen, codesKey]);

  if (!isOpen) return null;

  const toggleCode = (c: string) => {
    setSelectedCodes((prev) =>
      prev.includes(c) ? prev.filter((item) => item !== c) : [...prev, c]
    );
  };

  const handleDownloadPdf = async () => {
    if (selectedCodes.length === 0) return;
    setDownloading(true);
    try {
      const safeName = (productName || 'Product').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
      await downloadElementAsPdf('barcode-labels-sheet', `Barcodes_${safeName}`);
    } finally {
      setDownloading(false);
    }
  };

  const handlePrint = () => {
    if (selectedCodes.length === 0) return;
    window.print();
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/65 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="bg-[#0A2540] text-white px-4 py-3.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
              <Printer className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-extrabold truncate">Print Barcode Labels</h3>
              <p className="text-[11px] text-slate-300 truncate">
                {productName || 'Product'} · {selectedCodes.length} of {codes.length} selected
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Format & Select All Bar */}
        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 shrink-0">
          <div className="inline-flex bg-white border border-slate-200 rounded-xl p-0.5">
            <button
              type="button"
              onClick={() => setFormat('barcode')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-colors ${
                format === 'barcode' ? 'bg-[#0A2540] text-white' : 'text-slate-600'
              }`}
            >
              <BarcodeIcon className="w-3.5 h-3.5" />
              <span>Code-128</span>
            </button>
            <button
              type="button"
              onClick={() => setFormat('qr')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-colors ${
                format === 'qr' ? 'bg-[#0A2540] text-white' : 'text-slate-600'
              }`}
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>QR Code</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() =>
              setSelectedCodes(selectedCodes.length === codes.length ? [] : [...codes])
            }
            className="text-[11px] font-bold text-[#1565c0] px-2 py-1"
          >
            {selectedCodes.length === codes.length ? 'Deselect All' : 'Select All'}
          </button>
        </div>

        {/* Printable Preview Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-100/70">
          {codes.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
              <p className="text-xs font-bold text-slate-600">No barcodes or IMEIs added yet.</p>
              <p className="text-[11px] text-slate-400 mt-1">
                Scan, enter, or auto-generate at least one code first.
              </p>
            </div>
          ) : (
            <div id="barcode-labels-sheet" className="grid grid-cols-2 gap-2.5 bg-white p-3 rounded-2xl">
              {codes.map((code, idx) => {
                const isSelected = selectedCodes.includes(code);
                return (
                  <button
                    key={`${code}_${idx}`}
                    type="button"
                    onClick={() => toggleCode(code)}
                    className={`relative border rounded-xl p-2.5 text-center transition-all bg-white ${
                      isSelected
                        ? 'border-[#0A2540] ring-1 ring-[#0A2540]/20'
                        : 'border-dashed border-slate-300 opacity-45'
                    }`}
                  >
                    <span
                      className={`absolute top-1.5 right-1.5 w-4 h-4 rounded flex items-center justify-center ${
                        isSelected
                          ? 'bg-[#0A2540] text-white'
                          : 'border border-slate-300 bg-white'
                      }`}
                    >
                      {isSelected && <Check className="w-2.5 h-2.5" />}
                    </span>
                    {shopName && (
                      <p className="text-[8.5px] font-bold uppercase tracking-wide text-slate-400 truncate pr-4">
                        {shopName}
                      </p>
                    )}
                    <p className="text-[10.5px] font-extrabold text-[#0A2540] truncate pr-4">
                      {productName || 'Product Label'}
                    </p>
                    <div className="my-1.5 flex items-center justify-center">
                      {format === 'barcode' ? (
                        <Code128Svg value={code} />
                      ) : (
                        <QRCodeSVG value={code} size={58} />
                      )}
                    </div>
                    <p className="text-[10px] font-mono font-bold text-slate-800 tracking-tight truncate">
                      {code}
                    </p>
                    <p className="text-[10px] font-extrabold text-emerald-700 mt-0.5 tabular-nums">
                      ₹{price > 0 ? price : mrp || 0}
                      {mrp && mrp > price && price > 0 ? (
                        <span className="text-[9px] text-slate-400 line-through ml-1 font-normal">
                          ₹{mrp}
                        </span>
                      ) : null}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Action Buttons */}
        <div className="p-3.5 bg-white border-t border-slate-200 grid grid-cols-2 gap-2.5 shrink-0">
          <button
            type="button"
            disabled={downloading || selectedCodes.length === 0}
            onClick={handleDownloadPdf}
            className="py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#0A2540] font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            <span>{downloading ? 'Generating PDF...' : 'Download PDF'}</span>
          </button>
          <button
            type="button"
            disabled={selectedCodes.length === 0}
            onClick={handlePrint}
            className="py-3 rounded-xl bg-[#0A2540] hover:bg-[#103457] text-white font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <Printer className="w-4 h-4" />
            <span>Print ({selectedCodes.length})</span>
          </button>
        </div>
      </div>
    </div>
  );
};
