'use client';

import React, { useRef, useState, useEffect } from 'react';
import { Upload } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

interface ProductImageUploadProps {
  onFileSelected: (file: File) => void;
  isUploading?: boolean;
}

/**
 * AC-05, AC-06: Drag & drop / file picker component with instant preview.
 * AC-09: Validates file type and size before preview; shows toast on error.
 */
export function ProductImageUpload({ onFileSelected, isUploading }: ProductImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Cleanup object URL on unmount or when previewUrl changes (avoid memory leak)
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function validateAndPreview(file: File): boolean {
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error('Solo se permiten JPEG, PNG o WebP');
      return false;
    }
    if (file.size > MAX_SIZE_BYTES) {
      toast.error('Imagen demasiado grande. Máximo 5 MB');
      return false;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    onFileSelected(file);
    return true;
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) validateAndPreview(file);
    // Reset input so the same file can be re-selected
    e.target.value = '';
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) validateAndPreview(file);
  }

  return (
    <div className="space-y-3">
      {/* AC-05: Preview via URL.createObjectURL */}
      {previewUrl ? (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Vista previa"
            className="w-full h-40 object-cover rounded-lg border border-gray-200"
          />
        </div>
      ) : (
        /* AC-05: Drag & drop zone */
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
          className={cn(
            'flex flex-col items-center justify-center gap-2 h-32 cursor-pointer rounded-lg border-2 border-dashed transition-colors',
            isDragging
              ? 'border-primary bg-primary/5'
              : 'border-gray-300 hover:border-gray-400 bg-gray-50',
          )}
          role="button"
          tabIndex={0}
          aria-label="Zona de carga de imagen"
        >
          <Upload className="h-6 w-6 text-gray-400" />
          <p className="text-sm text-gray-500">
            Arrastra una imagen o{' '}
            <span className="text-primary underline">haz clic</span>
          </p>
          <p className="text-xs text-gray-400">JPEG, PNG, WebP · máx. 5 MB</p>
        </div>
      )}

      {/* AC-06: Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileChange}
        aria-label="Seleccionar archivo de imagen"
      />

      {/* Progress indicator during upload */}
      {isUploading && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          Subiendo imagen...
        </div>
      )}
    </div>
  );
}
