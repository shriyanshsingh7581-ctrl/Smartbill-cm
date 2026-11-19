import React, { useRef, useState } from 'react';
import {
  Camera,
  Check,
  CheckCircle2,
  ChevronLeft,
  ClipboardPaste,
  ImagePlus,
  Layers,
  Loader2,
  Maximize2,
  Plus,
  ScanLine,
  Smartphone,
  Trash2,
  X,
} from 'lucide-react';
import { saveProductToDb } from '../firebase';
import {
  extractAllCodesFromText,
  extractBulkImeisFromImageFile,
  isValidImeiLuhn,
  normalizeScannedCode,
  uploadImageToCloudinary,
} from '../services/integrations';
import { BarcodeScannerModal } from './BarcodeScannerModal';

interface BulkImeiEntry {
  code: string;
  selected: boolean;
  isValidImei: boolean;
  is15Digit: boolean;
  source: 'photo' | 'live' | 'manual';
}

interface BulkPhotoItem {
  id: string;
  previewUrl: string;
  uploadedUrl?: string;
  file?: File;
  uploading: boolean;
}

interface BulkImeiAddScreenProps {
  uid: string;
  onBack: () => void;
  onSaved: (productName: string, count: number) => void;
  onToast: (type: 'success' | 'error', msg: string) => void;
}

export const BulkImeiAddScreen: React.FC<BulkImeiAddScreenProps> = ({
  uid,
  onBack,
  onSaved,
  onToast,
}) => {
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  const [photos, setPhotos] = useState<BulkPhotoItem[]>([]);
  const [entries, setEntries] = useState<BulkImeiEntry[]>([]);
  const [scanningStatus, setScanningStatus] = useState<string | null>(null);
  const [liveBulkOpen, setLiveBulkOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [manualSingleCode, setManualSingleCode] = useState('');
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // Product metadata
  const [productName, setProductName] = useState('');
  const [variantName, setVariantName] = useState('');
  const [mrp, setMrp] = useState('');
  const [retailPrice, setRetailPrice] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [unit, setUnit] = useState('Piece');
  const [gst, setGst] = useState('18');
  const [lowStockAlert, setLowStockAlert] = useState('2');
  const [saving, setSaving] = useState(false);

  const mergeDetectedCodes = (
    newCodes: string[],
    source: 'photo' | 'live' | 'manual'
  ): number => {
    let addedCount = 0;
    setEntries((prev) => {
      const existingSet = new Set(prev.map((e) => e.code));
      const toAdd: BulkImeiEntry[] = [];
      for (const raw of newCodes) {
        const clean = normalizeScannedCode(raw);
        if (!clean || clean.length < 4 || existingSet.has(clean)) continue;
        existingSet.add(clean);
        const is15Digit = /^\d{15}$/.test(clean);
        toAdd.push({
          code: clean,
          selected: true,
          is15Digit,
          isValidImei: is15Digit && isValidImeiLuhn(clean),
          source,
        });
      }
      addedCount = toAdd.length;
      if (toAdd.length === 0) return prev;
      return [...prev, ...toAdd];
    });
    return addedCount;
  };

  const handleBulkPhotoFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    let totalFoundAcrossFiles = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const photoId = `bulk_photo_${Date.now()}_${i}`;
      const localPreview = URL.createObjectURL(file);

      // Show photo preview immediately alongside IMEI list
      setPhotos((prev) => [
        ...prev,
        { id: photoId, previewUrl: localPreview, file, uploading: true },
      ]);

      // Start Cloudinary upload in parallel so saving is instant
      void uploadImageToCloudinary(file)
        .then((url) => {
          setPhotos((prev) =>
            prev.map((p) =>
              p.id === photoId ? { ...p, uploadedUrl: url, uploading: false } : p
            )
          );
        })
        .catch(() => {
          setPhotos((prev) =>
            prev.map((p) => (p.id === photoId ? { ...p, uploading: false } : p))
          );
        });

      setScanningStatus(
        files.length > 1
          ? `Photo ${i + 1}/${files.length} se sabhi IMEI scan ho rahe hain...`
          : 'Photo se sabhi IMEI / Barcode scan ho rahe hain...'
      );

      try {
        const result = await extractBulkImeisFromImageFile(file);
        if (result.productName && !productName.trim()) {
          setProductName(result.productName);
        }
        if (result.codes.length > 0) {
          mergeDetectedCodes(result.codes, 'photo');
          totalFoundAcrossFiles += result.codes.length;
        }
      } catch (err) {
        console.warn('Bulk photo scan error:', err);
      }
    }

    setScanningStatus(null);
    if (totalFoundAcrossFiles > 0) {
      onToast('success', `${totalFoundAcrossFiles} IMEI / code photo se scan ho gaye!`);
    } else {
      onToast(
        'error',
        'Photo mein IMEI clear nahi dikha. Clear close-up photo lein ya Live Bulk Scan use karein.'
      );
    }
  };

  const handleAddPastedImeis = () => {
    if (!pasteText.trim()) return;
    const extracted = extractAllCodesFromText(pasteText);
    const lines = pasteText
      .split(/[\n,;]+/)
      .map((s) => normalizeScannedCode(s))
      .filter((s) => s.length >= 6);
    const combined = Array.from(new Set([...extracted.allCodes, ...lines]));
    if (combined.length === 0) {
      onToast('error', 'Koi valid IMEI ya barcode number nahi mila.');
      return;
    }
    mergeDetectedCodes(combined, 'manual');
    setPasteText('');
    setPasteOpen(false);
    onToast('success', `${combined.length} codes list mein add ho gaye!`);
  };

  const handleAddSingleManual = () => {
    const clean = normalizeScannedCode(manualSingleCode);
    if (!clean) return;
    mergeDetectedCodes([clean], 'manual');
    setManualSingleCode('');
  };

  const selectedEntries = entries.filter((e) => e.selected);
  const selectedCount = selectedEntries.length;
  const totalCount = entries.length;
  const imei15Count = entries.filter((e) => e.is15Digit).length;

  const selectAll = () => setEntries((prev) => prev.map((e) => ({ ...e, selected: true })));
  const deselectAll = () => setEntries((prev) => prev.map((e) => ({ ...e, selected: false })));
  const selectOnly15DigitImeis = () =>
    setEntries((prev) => prev.map((e) => ({ ...e, selected: e.is15Digit })));
  const selectEveryFirstOfPair = () => {
    let imeiIdx = 0;
    setEntries((prev) =>
      prev.map((e) => {
        if (!e.is15Digit) return { ...e, selected: false };
        const keep = imeiIdx % 2 === 0;
        imeiIdx += 1;
        return { ...e, selected: keep };
      })
    );
  };

  const handleSaveBulkProduct = async () => {
    if (!productName.trim()) {
      onToast('error', 'Product Name zaroor bharein (e.g., Redmi 13C 5G)');
      return;
    }
    if (selectedCount === 0) {
      onToast('error', 'Kam se kam 1 IMEI / Barcode select karein');
      return;
    }

    setSaving(true);
    try {
      // Ensure any still-uploading photos finish uploading to Cloudinary
      const finalPhotoUrls: string[] = [];
      for (const p of photos) {
        if (p.uploadedUrl && !p.uploadedUrl.startsWith('data:')) {
          finalPhotoUrls.push(p.uploadedUrl);
        } else if (p.file) {
          try {
            const url = await uploadImageToCloudinary(p.file);
            if (url && !url.startsWith('data:')) {
              finalPhotoUrls.push(url);
            }
          } catch {
            // Skip failed photo upload rather than blocking product save
          }
        }
      }

      const selectedCodes = selectedEntries.map((e) => e.code);
      const mrpNum = Math.max(0, Number(mrp) || 0);
      const retailNum = Math.max(0, Number(retailPrice) || mrpNum);
      const purchaseNum = Math.max(0, Number(purchasePrice) || 0);

      await saveProductToDb(uid, {
        name: productName.trim(),
        variantName: variantName.trim(),
        barcode: selectedCodes[0] || '',
        unit,
        mrp: mrpNum,
        retailPrice: retailNum,
        wholesalePrice: 0,
        purchasePrice: purchaseNum,
        quantity: selectedCodes.length,
        lowStockAlert: Math.max(0, Number(lowStockAlert) || 2),
        gst: Math.min(100, Math.max(0, Number(gst) || 0)),
        cess: 0,
        hsn: '',
        rack: '',
        category: 'Mobile / IMEI',
        expiryDate: '',
        imageUrl: finalPhotoUrls[0] || '',
        archived: false,
        imeis: selectedCodes,
        imeiPhotoUrls: finalPhotoUrls,
        variants: [
          {
            variantName: variantName.trim() || `${selectedCodes.length} Pcs Bulk`,
            quantity: selectedCodes.length,
            barcode: selectedCodes[0] || '',
            mrp: mrpNum,
            retailPrice: retailNum,
            wholesalePrice: 0,
            purchasePrice: purchaseNum,
            setAsDefault: true,
            includingGst: true,
            discountValue: 0,
            discountType: '%',
            batch: '',
            packOf: 1,
            hsn: '',
            gst: Math.min(100, Math.max(0, Number(gst) || 0)),
            cess: 0,
            expiryDate: '',
            lowStockAlert: Math.max(0, Number(lowStockAlert) || 2),
            rack: '',
          },
        ],
      });

      onSaved(productName.trim(), selectedCodes.length);
    } catch (err) {
      console.error('Bulk IMEI product save error:', err);
      onToast('error', 'Product save nahi hua. Connection check karke dubara try karein.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F3F5F8] flex flex-col pb-28">
      {/* Hidden native camera & multi-gallery inputs */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          void handleBulkPhotoFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          void handleBulkPhotoFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {/* Top Navy Header */}
      <header className="bg-[#0A2540] text-white px-4 h-14 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center active:scale-95 shrink-0"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-[15px] font-bold leading-tight truncate">
              Bulk Photo & IMEI Scan
            </h1>
            <p className="text-[11px] text-teal-200 leading-tight truncate">
              8, 10, 20, 50 Pcs ek saath scan & save
            </p>
          </div>
        </div>
        <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-xs font-extrabold tabular-nums shrink-0">
          {selectedCount} Pcs
        </span>
      </header>

      <div className="p-4 space-y-4 max-w-md mx-auto w-full">
        {/* 1. Scan Action Hub Card */}
        <section className="bg-white rounded-[22px] p-4 border border-slate-200/80 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-[13.5px] font-bold text-[#0A2540] leading-tight">
                  1. Scan Bulk IMEIs (Photo ya Live)
                </h2>
                <p className="text-[11px] text-slate-500">
                  Box stack, carton sticker ya IMEI sheet ki photo lein
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              disabled={Boolean(scanningStatus)}
              onClick={() => cameraInputRef.current?.click()}
              className="bg-gradient-to-br from-[#0F766E] to-[#0A2540] text-white rounded-2xl p-3 flex flex-col items-center justify-center gap-1.5 shadow-sm active:scale-95 transition disabled:opacity-60"
            >
              <Camera className="w-5 h-5 text-amber-300" />
              <span className="text-[11.5px] font-bold leading-tight text-center">
                Bulk Photo
              </span>
              <span className="text-[9.5px] text-teal-100 leading-none">Camera</span>
            </button>

            <button
              type="button"
              disabled={Boolean(scanningStatus)}
              onClick={() => galleryInputRef.current?.click()}
              className="bg-slate-50 border border-slate-200 text-[#0A2540] rounded-2xl p-3 flex flex-col items-center justify-center gap-1.5 hover:bg-slate-100 active:scale-95 transition disabled:opacity-60"
            >
              <ImagePlus className="w-5 h-5 text-indigo-600" />
              <span className="text-[11.5px] font-bold leading-tight text-center">
                Gallery
              </span>
              <span className="text-[9.5px] text-slate-500 leading-none">Multi Photo</span>
            </button>

            <button
              type="button"
              disabled={Boolean(scanningStatus)}
              onClick={() => setLiveBulkOpen(true)}
              className="bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl p-3 flex flex-col items-center justify-center gap-1.5 hover:bg-emerald-100/70 active:scale-95 transition disabled:opacity-60"
            >
              <ScanLine className="w-5 h-5 text-emerald-600" />
              <span className="text-[11.5px] font-bold leading-tight text-center">
                Live Scan
              </span>
              <span className="text-[9.5px] text-emerald-700 leading-none">1-by-1 Fast</span>
            </button>
          </div>

          {scanningStatus && (
            <div className="bg-teal-50 border border-teal-200 rounded-xl px-3.5 py-2.5 flex items-center gap-2.5 text-xs font-bold text-teal-900">
              <Loader2 className="w-4 h-4 animate-spin text-teal-600 shrink-0" />
              <span>{scanningStatus}</span>
            </div>
          )}

          {/* Quick Add Single IMEI or Paste Bulk List */}
          <div className="flex items-center gap-2 pt-0.5">
            <input
              type="text"
              value={manualSingleCode}
              onChange={(e) => setManualSingleCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddSingleManual();
                }
              }}
              placeholder="Type 15-digit IMEI & press +..."
              className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 outline-none focus:border-[#0A2540]"
            />
            <button
              type="button"
              onClick={handleAddSingleManual}
              className="w-9 h-9 rounded-xl bg-[#0A2540] text-white flex items-center justify-center active:scale-95 shrink-0"
              title="Add IMEI"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setPasteOpen((v) => !v)}
              className={`h-9 px-2.5 rounded-xl border text-[11px] font-bold flex items-center gap-1 active:scale-95 shrink-0 ${
                pasteOpen
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-slate-50 text-slate-700 border-slate-200'
              }`}
              title="Paste IMEI List"
            >
              <ClipboardPaste className="w-3.5 h-3.5" />
              <span>Paste</span>
            </button>
          </div>

          {pasteOpen && (
            <div className="space-y-2 pt-1">
              <textarea
                rows={3}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="WhatsApp / Bill se 8, 10, 20, 50 IMEI numbers yahan paste karein..."
                className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-mono outline-none focus:border-[#0A2540]"
              />
              <button
                type="button"
                onClick={handleAddPastedImeis}
                className="w-full bg-indigo-600 text-white text-xs font-bold py-2 rounded-xl active:scale-[0.99]"
              >
                Extract & Add All IMEIs
              </button>
            </div>
          )}
        </section>

        {/* 2. Captured Bulk IMEI Photos + All Scanned IMEIs Shown Together */}
        {(photos.length > 0 || entries.length > 0) && (
          <section className="bg-white rounded-[22px] p-4 border border-slate-200/80 shadow-xs space-y-3.5">
            {/* Bulk IMEI Photo Strip (Tap to Zoom) */}
            {photos.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#0A2540]">
                    IMEI Photo ({photos.length})
                  </span>
                  <span className="text-[10.5px] text-slate-400">Tap photo to zoom</span>
                </div>
                <div className="flex gap-2.5 overflow-x-auto pb-1 no-scrollbar">
                  {photos.map((photo, idx) => (
                    <div
                      key={photo.id}
                      className="relative w-24 h-24 rounded-2xl overflow-hidden border border-slate-200 shrink-0 bg-slate-100"
                    >
                      <img
                        src={photo.previewUrl}
                        alt={`IMEI Bulk ${idx + 1}`}
                        onClick={() => setLightboxUrl(photo.previewUrl)}
                        className="w-full h-full object-cover cursor-pointer"
                      />
                      <button
                        type="button"
                        onClick={() => setLightboxUrl(photo.previewUrl)}
                        className="absolute bottom-1 right-1 w-6 h-6 rounded-lg bg-black/65 text-white flex items-center justify-center"
                        title="Zoom Photo"
                      >
                        <Maximize2 className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setPhotos((prev) => prev.filter((item) => item.id !== photo.id))
                        }
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center"
                        title="Remove Photo"
                      >
                        <X className="w-3 h-3" />
                      </button>
                      {photo.uploading && (
                        <div className="absolute inset-0 bg-black/35 flex items-center justify-center pointer-events-none">
                          <Loader2 className="w-4 h-4 text-white animate-spin" />
                        </div>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    className="w-24 h-24 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center gap-1 text-slate-500 shrink-0 active:scale-95"
                  >
                    <Plus className="w-5 h-5" />
                    <span className="text-[10px] font-bold">Add Photo</span>
                  </button>
                </div>
              </div>
            )}

            {/* All Scanned IMEI Checklist */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-[13.5px] font-bold text-[#0A2540]">
                    Scanned IMEI List ({selectedCount}/{totalCount} Selected)
                  </h3>
                  <p className="text-[11px] text-emerald-700 font-semibold">
                    Stock Qty = {selectedCount} {unit} (Auto-synced)
                  </p>
                </div>
                {totalCount > 0 && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={selectedCount === totalCount ? deselectAll : selectAll}
                      className="text-[11px] font-bold text-[#0A2540] bg-slate-100 px-2.5 py-1.5 rounded-lg active:scale-95"
                    >
                      {selectedCount === totalCount ? 'Unselect All' : 'Select All'}
                    </button>
                  </div>
                )}
              </div>

              {/* Smart Selection Helpers (when mixed barcodes or dual-SIM IMEI 1 + IMEI 2 appear) */}
              {totalCount > 0 && (imei15Count > 0 && imei15Count < totalCount || imei15Count >= 4 && imei15Count % 2 === 0) && (
                <div className="flex flex-wrap gap-1.5">
                  {imei15Count > 0 && imei15Count < totalCount && (
                    <button
                      type="button"
                      onClick={selectOnly15DigitImeis}
                      className="text-[10.5px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-1 rounded-lg active:scale-95"
                    >
                      Only 15-Digit IMEIs ({imei15Count})
                    </button>
                  )}
                  {imei15Count >= 4 && imei15Count % 2 === 0 && (
                    <button
                      type="button"
                      onClick={selectEveryFirstOfPair}
                      className="text-[10.5px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200 px-2.5 py-1 rounded-lg active:scale-95"
                    >
                      Dual-SIM Box? Keep IMEI-1 Only ({imei15Count / 2} Pcs)
                    </button>
                  )}
                </div>
              )}

              {entries.length === 0 ? (
                <div className="bg-slate-50 rounded-xl p-4 text-center text-xs text-slate-500">
                  Abhi koi IMEI detect nahi hua. Photo lein ya Live Scan button dabayein.
                </div>
              ) : (
                <div className="max-h-72 overflow-y-auto space-y-1.5 pr-0.5">
                  {entries.map((entry, idx) => (
                    <div
                      key={entry.code}
                      onClick={() =>
                        setEntries((prev) =>
                          prev.map((item) =>
                            item.code === entry.code
                              ? { ...item, selected: !item.selected }
                              : item
                          )
                        )
                      }
                      className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border cursor-pointer transition-colors ${
                        entry.selected
                          ? 'bg-emerald-50/70 border-emerald-300'
                          : 'bg-slate-50 border-slate-200 opacity-65'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 border ${
                            entry.selected
                              ? 'bg-emerald-600 border-emerald-600 text-white'
                              : 'bg-white border-slate-300'
                          }`}
                        >
                          {entry.selected && <Check className="w-3.5 h-3.5" />}
                        </div>
                        <span className="text-[11px] font-bold text-slate-400 tabular-nums w-6 shrink-0">
                          #{idx + 1}
                        </span>
                        <span className="text-xs font-mono font-bold text-[#0A2540] truncate">
                          {entry.code}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {entry.isValidImei ? (
                          <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                            IMEI ✓
                          </span>
                        ) : entry.is15Digit ? (
                          <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                            15-Digit
                          </span>
                        ) : (
                          <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">
                            Code
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEntries((prev) => prev.filter((item) => item.code !== entry.code));
                          }}
                          className="p-1 text-slate-400 hover:text-rose-500"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* 3. Product Details & Pricing Card */}
        <section className="bg-white rounded-[22px] p-4 border border-slate-200/80 shadow-xs space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
              <Smartphone className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-[13.5px] font-bold text-[#0A2540] leading-tight">
                2. Product Details & Price
              </h2>
              <p className="text-[11px] text-slate-500">
                Quantity apne aap selected IMEIs ({selectedCount}) ke barabar save hogi
              </p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Product / Model Name *
            </label>
            <input
              type="text"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="e.g., Redmi 13C 5G, Vivo T3x, Samsung A15"
              className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-[#0A2540] outline-none focus:border-[#0A2540]"
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Variant / RAM-ROM
              </label>
              <input
                type="text"
                value={variantName}
                onChange={(e) => setVariantName(e.target.value)}
                placeholder="e.g., 6/128GB Black"
                className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs outline-none focus:border-[#0A2540]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Stock Quantity (Auto)
              </label>
              <div className="flex items-center gap-1.5">
                <div className="flex-1 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 text-xs font-extrabold text-emerald-800 tabular-nums">
                  {selectedCount} {unit}
                </div>
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="border border-slate-300 rounded-xl px-2 py-2 text-xs font-bold bg-white"
                >
                  <option value="Piece">Piece</option>
                  <option value="Box">Box</option>
                  <option value="Unit">Unit</option>
                </select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                MRP (₹)
              </label>
              <input
                type="number"
                value={mrp}
                onChange={(e) => {
                  setMrp(e.target.value);
                  if (!retailPrice) setRetailPrice(e.target.value);
                }}
                placeholder="14999"
                className="w-full border border-slate-300 rounded-xl px-2.5 py-2 text-xs font-semibold outline-none focus:border-[#0A2540]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Selling (₹)
              </label>
              <input
                type="number"
                value={retailPrice}
                onChange={(e) => setRetailPrice(e.target.value)}
                placeholder="13999"
                className="w-full border border-slate-300 rounded-xl px-2.5 py-2 text-xs font-semibold outline-none focus:border-[#0A2540]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Purchase (₹)
              </label>
              <input
                type="number"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
                placeholder="12500"
                className="w-full border border-slate-300 rounded-xl px-2.5 py-2 text-xs font-semibold outline-none focus:border-[#0A2540]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                GST (%)
              </label>
              <input
                type="number"
                value={gst}
                onChange={(e) => setGst(e.target.value)}
                className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Low Stock Alert
              </label>
              <input
                type="number"
                value={lowStockAlert}
                onChange={(e) => setLowStockAlert(e.target.value)}
                className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs outline-none"
              />
            </div>
          </div>
        </section>
      </div>

      {/* Sticky Save Action Bar */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-white/95 backdrop-blur-md border-t border-slate-200 px-4 py-3 z-30">
        <button
          type="button"
          disabled={saving || Boolean(scanningStatus)}
          onClick={handleSaveBulkProduct}
          className="w-full bg-gradient-to-r from-[#0F766E] to-[#0A2540] text-white font-extrabold text-sm py-3.5 rounded-2xl shadow-lg flex items-center justify-center gap-2 active:scale-[0.99] disabled:opacity-60"
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Saving {selectedCount} IMEIs & Photo...</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4 text-emerald-300" />
              <span>
                Save Product · {selectedCount} {unit} ({selectedCount} IMEIs)
              </span>
            </>
          )}
        </button>
      </div>

      {/* Live Continuous Rapid Multi-IMEI Scanner Modal */}
      <BarcodeScannerModal
        isOpen={liveBulkOpen}
        onClose={() => setLiveBulkOpen(false)}
        onScanSuccess={() => {}}
        bulkMode
        initialCodes={entries.map((e) => e.code)}
        title="Bulk Rapid IMEI Scanner"
        onBulkComplete={(scannedCodes) => {
          const added = mergeDetectedCodes(scannedCodes, 'live');
          if (added > 0) {
            onToast('success', `${added} naye IMEI/Barcodes add ho gaye!`);
          }
        }}
      />

      {/* Full-Screen Photo Zoom Lightbox */}
      {lightboxUrl && (
        <div
          onClick={() => setLightboxUrl(null)}
          className="fixed inset-0 z-[70] bg-black/95 flex flex-col items-center justify-center p-4"
        >
          <button
            type="button"
            onClick={() => setLightboxUrl(null)}
            className="absolute top-5 right-5 w-10 h-10 rounded-full bg-white/15 text-white flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={lightboxUrl}
            alt="Bulk IMEI Zoom"
            onClick={(e) => e.stopPropagation()}
            className="max-w-full max-h-[82vh] rounded-2xl object-contain shadow-2xl"
          />
          <p className="text-xs text-slate-300 mt-3">
            Tap outside to close • {selectedCount} IMEIs selected
          </p>
        </div>
      )}
    </div>
  );
};
