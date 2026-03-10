'use client';

import { useRef, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Upload, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const MAX_FILE_SIZE_MB = 5;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

interface CatalogUploadProps {
  isPending: boolean;
  onUpload: (formData: FormData) => void;
}

export function CatalogUpload({ isPending, onUpload }: CatalogUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const validateAndUpload = useCallback(
    (file: File) => {
      // AC-10: validate extension
      if (!file.name.toLowerCase().endsWith('.csv')) {
        toast.error('Solo se permiten archivos CSV');
        return;
      }
      // AC-11: validate size
      if (file.size > MAX_FILE_SIZE_BYTES) {
        const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
        toast.error(`Archivo demasiado grande (${sizeMB}MB). Límite: ${MAX_FILE_SIZE_MB}MB`);
        return;
      }
      const formData = new FormData();
      formData.append('file', file);
      onUpload(formData);
    },
    [onUpload],
  );

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) validateAndUpload(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) validateAndUpload(file);
    // Reset input so same file can be re-selected
    e.target.value = '';
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        'relative border-2 border-dashed rounded-lg p-8 text-center transition-colors',
        isDragging
          ? 'border-gray-900 bg-gray-50'
          : 'border-gray-300 bg-white hover:border-gray-400',
        isPending && 'pointer-events-none opacity-60',
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        onChange={handleFileChange}
        className="hidden"
        aria-label="Seleccionar archivo CSV"
      />

      <div className="flex flex-col items-center gap-3">
        {isPending ? (
          <>
            <Loader2 className="h-10 w-10 text-gray-400 animate-spin" />
            <p className="text-sm font-medium text-gray-700">Importando productos...</p>
            <p className="text-xs text-gray-500">Esto puede tomar unos segundos</p>
          </>
        ) : (
          <>
            <div className="rounded-full bg-gray-100 p-3">
              {isDragging ? (
                <FileText className="h-8 w-8 text-gray-700" />
              ) : (
                <Upload className="h-8 w-8 text-gray-500" />
              )}
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700">
                {isDragging ? 'Suelta el archivo aquí' : 'Arrastra tu catálogo CSV aquí'}
              </p>
              <p className="text-xs text-gray-500 mt-1">o</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => inputRef.current?.click()}
            >
              Seleccionar archivo
            </Button>
            <p className="text-xs text-gray-400">Solo archivos .csv · Máx {MAX_FILE_SIZE_MB}MB</p>
          </>
        )}
      </div>
    </div>
  );
}
