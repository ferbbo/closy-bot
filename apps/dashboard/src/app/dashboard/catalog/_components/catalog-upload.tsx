'use client';

import { useRef, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { Upload, FileText, Loader2 } from 'lucide-react';
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

  const validateAndUpload = useCallback( async (file: File) => {
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
      // Content sniffing: leer los primeros 512 bytes para detectar archivos binarios
    // disfrazados con extensión .csv
    try {
      const buffer = await file.slice(0, 512).arrayBuffer();
      const bytes = new Uint8Array(buffer);

      // Bytes nulos → archivo binario
      if (bytes.some((b) => b === 0x00)) {
        toast.error('El archivo no es un CSV válido (contiene datos binarios).');
        return;
      }

      // Magic bytes de formatos binarios conocidos
      const isBinarySignature =
        (bytes[0] === 0x4d && bytes[1] === 0x5a) ||                                          // EXE/DLL (MZ)
        (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) || // ZIP / DOCX / XLSX
        (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) || // PDF (%PDF)
        (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) || // PNG
        (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) ||                      // JPEG
        (bytes[0] === 0x7f && bytes[1] === 0x45 && bytes[2] === 0x4c && bytes[3] === 0x46) || // ELF
        (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) ||                      // GIF
        (bytes[0] === 0x42 && bytes[1] === 0x4d);                                             // BMP

      if (isBinarySignature) {
        toast.error('El archivo no es un CSV válido (formato binario detectado).');
        return;
      }
      // JSON detection — texto plano, sin magic bytes binarios.
      // El primer carácter no-whitespace de un JSON siempre es { o [.
      // Un header CSV válido nunca puede comenzar con esos caracteres.
      const firstSignificant = bytes.find((b) => b !== 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d);
      if (firstSignificant === 0x7b || firstSignificant === 0x5b) {
         toast.error('El archivo no es un CSV válido (formato JSON detectado).');
        return;
      }
    } catch {
       toast.error('No se pudo verificar el contenido del archivo. Intenta de nuevo.');
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
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
        }}
      role='button'
      tabIndex={0}
      aria-label="Zona de carga de archivo CSV"
      className={cn(
        'relative border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer',
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
                {isDragging ? 'Suelta el archivo aquí' : 'Haz click  o arrastra tu catálogo CSV'}
              </p>
            </div>
            <p className="text-xs text-gray-400">Solo archivos .csv · Máx {MAX_FILE_SIZE_MB}MB</p>
          </>
        )}
      </div>
    </div>
  );
}
