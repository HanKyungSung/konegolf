import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Camera, Upload, X, Check, Loader2, RefreshCw } from 'lucide-react';
import { compressImage } from '@/lib/compress-image';
import { uploadReceipt, getReceiptUrl } from '@/services/pos-api';

interface ReceiptCaptureModalProps {
  paymentId: string;
  mode?: 'upload' | 'view';
  onClose: () => void;
  onUploaded: () => void;
}

export default function ReceiptCaptureModal({ paymentId, mode = 'upload', onClose, onUploaded }: ReceiptCaptureModalProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [selectedBlob, setSelectedBlob] = useState<Blob | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(mode === 'view');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load existing receipt when in view mode
  useEffect(() => {
    if (mode !== 'view') return;
    setLoading(true);
    getReceiptUrl(paymentId)
      .then((url) => {
        if (url) setPreview(url);
        else setError('Receipt not found');
      })
      .catch(() => setError('Failed to load receipt'))
      .finally(() => setLoading(false));
  }, [paymentId, mode]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);

    try {
      const compressed = await compressImage(file);
      setSelectedBlob(compressed);
      if (preview && !preview.startsWith('blob:')) {
        // Don't revoke server URLs
      } else if (preview) {
        URL.revokeObjectURL(preview);
      }
      setPreview(URL.createObjectURL(compressed));
      setReplacing(true);
    } catch {
      setError('Failed to process image. Please try again.');
    }
  }, [preview]);

  const handleUpload = useCallback(async () => {
    if (!selectedBlob) return;

    setUploading(true);
    setError(null);

    try {
      await uploadReceipt(paymentId, selectedBlob);
      setSuccess(true);
      setTimeout(() => {
        onUploaded();
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [paymentId, selectedBlob, onUploaded, onClose]);

  const handleRetake = useCallback(() => {
    if (preview && preview.startsWith('blob:')) URL.revokeObjectURL(preview);
    setPreview(null);
    setSelectedBlob(null);
    setReplacing(false);
    setError(null);
    fileInputRef.current?.click();
  }, [preview]);

  const isViewingExisting = mode === 'view' && !replacing && !success;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-slate-800 rounded-xl border border-slate-700 max-w-lg w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Camera className="w-5 h-5 text-amber-400" />
            {isViewingExisting ? 'Receipt Photo' : 'Attach Receipt'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {loading ? (
            <div className="flex flex-col items-center gap-3 py-12">
              <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
              <p className="text-slate-400">Loading receipt...</p>
            </div>
          ) : success ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <Check className="w-8 h-8 text-emerald-400" />
              </div>
              <p className="text-emerald-400 font-medium text-lg">Receipt Uploaded!</p>
            </div>
          ) : preview ? (
            <>
              <div className="rounded-lg overflow-hidden border border-slate-600 bg-slate-900">
                <img
                  src={preview}
                  alt="Receipt"
                  className="w-full max-h-[60vh] object-contain"
                />
              </div>
              {error && (
                <p className="text-red-400 text-sm text-center">{error}</p>
              )}
              {isViewingExisting ? (
                <div className="flex gap-3">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 py-3 px-4 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-medium flex items-center justify-center gap-2"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Replace
                  </button>
                  <button
                    onClick={onClose}
                    className="flex-1 py-3 px-4 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-700 font-medium"
                  >
                    Close
                  </button>
                </div>
              ) : (
                <div className="flex gap-3">
                  <button
                    onClick={handleRetake}
                    disabled={uploading}
                    className="flex-1 py-3 px-4 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-700 font-medium disabled:opacity-50"
                  >
                    Retake
                  </button>
                  <button
                    onClick={handleUpload}
                    disabled={uploading}
                    className="flex-1 py-3 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4" />
                        {replacing ? 'Replace' : 'Upload'}
                      </>
                    )}
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              {error && (
                <p className="text-red-400 text-sm text-center">{error}</p>
              )}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-12 rounded-lg border-2 border-dashed border-slate-600 hover:border-amber-500/50 hover:bg-slate-700/50 transition-colors flex flex-col items-center gap-3 text-slate-400 hover:text-slate-200"
              >
                <Camera className="w-12 h-12" />
                <span className="font-medium">Tap to take photo or select file</span>
                <span className="text-sm text-slate-500">JPEG or PNG, max 5MB</span>
              </button>
            </>
          )}
        </div>

        {/* Hidden file input — capture="environment" for tablet rear camera */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>
    </div>
  );
}
