import React, { useRef, useState } from 'react';
import { Camera, ImagePlus, Loader2, X } from 'lucide-react';
import { uploadImageToCloudinary } from '../services/integrations';

interface ApkPhotoSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  onUploaded: (url: string) => void | Promise<void>;
}

export const ApkPhotoSheet: React.FC<ApkPhotoSheetProps> = ({
  isOpen,
  onClose,
  title = 'Upload Photo',
  onUploaded,
}) => {
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileSelected = async (file?: File) => {
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      const url = await uploadImageToCloudinary(file);
      await onUploaded(url);
      onClose();
    } catch (err) {
      console.error('Photo upload failed:', err);
      setUploadError('Photo upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end justify-center">
      {/* Direct Native Camera Capture Input */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          void handleFileSelected(file);
        }}
      />

      {/* Gallery Upload Input */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          void handleFileSelected(file);
        }}
      />

      <div className="bg-white w-full max-w-md rounded-t-3xl p-5 space-y-4 shadow-2xl">
        <div className="w-10 h-1 bg-slate-300 rounded-full mx-auto" />
        <div className="flex items-center justify-between">
          <h3 className="text-base font-extrabold text-[#0A2540]">{title}</h3>
          <button
            type="button"
            disabled={uploading}
            onClick={() => {
              setUploadError(null);
              onClose();
            }}
            className="p-2 rounded-full bg-slate-100 text-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {uploadError && (
          <p className="text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
            {uploadError}
          </p>
        )}

        {uploading ? (
          <div className="py-8 text-center space-y-2.5">
            <Loader2 className="w-8 h-8 text-[#0A2540] animate-spin mx-auto" />
            <p className="text-xs font-bold text-slate-700">Compressing &amp; uploading photo...</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 pb-2">
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="p-4 rounded-2xl bg-[#0A2540] text-white flex flex-col items-center gap-2 shadow-md active:scale-95 transition-transform"
            >
              <Camera className="w-6 h-6 text-emerald-300" />
              <span className="text-xs font-extrabold">Take Photo</span>
              <span className="text-[10px] text-slate-300">Native Camera</span>
            </button>

            <button
              type="button"
              onClick={() => galleryInputRef.current?.click()}
              className="p-4 rounded-2xl bg-slate-100 border border-slate-200 text-[#0A2540] flex flex-col items-center gap-2 active:scale-95 transition-transform"
            >
              <ImagePlus className="w-6 h-6 text-[#0A2540]" />
              <span className="text-xs font-extrabold">Choose Gallery</span>
              <span className="text-[10px] text-slate-500">Saved Photos</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
