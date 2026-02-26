'use client';

import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { Upload, FileText, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useImportCatalog } from '@/hooks/use-onboarding';
import type { OnboardingStepKey, ImportStats } from '@/lib/api';

const MAX_FILE_SIZE_MB = 5;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

interface StepCatalogProps {
  completedSteps: OnboardingStepKey[];
  onNext: () => void;
  onBack: () => void;
}

export function StepCatalog({ completedSteps, onNext, onBack }: StepCatalogProps) {
  const isCompleted = completedSteps.includes('catalog');
  const importMutation = useImportCatalog();
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [importStats, setImportStats] = useState<ImportStats | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateAndSetFile = (file: File) => {
    setValidationError(null);
    if (!file.name.endsWith('.csv')) {
      setValidationError('Solo se permiten archivos .csv');
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setValidationError(`El archivo supera el límite de ${MAX_FILE_SIZE_MB}MB`);
      return;
    }
    setSelectedFile(file);
    setImportStats(null);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) validateAndSetFile(file);
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) validateAndSetFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const result = await importMutation.mutateAsync(formData);
      setImportStats(result);
      setSelectedFile(null);
    } catch {
      // error is in importMutation.error
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Sube tu catálogo de productos</h2>
        <p className="mt-1 text-sm text-gray-500">
          Importa tus productos desde un archivo CSV. Máximo {MAX_FILE_SIZE_MB}MB.
        </p>
      </div>

      {isCompleted && !importStats && (
        <Alert variant="success">
          <AlertTitle>✅ Catálogo importado</AlertTitle>
          <AlertDescription>
            Tus productos ya están cargados. Puedes continuar o subir un nuevo archivo para
            reemplazar el catálogo.
          </AlertDescription>
        </Alert>
      )}

      {importStats && (
        <Alert variant="success">
          <AlertTitle>✅ Importación exitosa</AlertTitle>
          <AlertDescription>
            <p>
              {importStats.created + importStats.updated} productos importados correctamente
              {importStats.created > 0 && `, ${importStats.created} nuevos`}
              {importStats.updated > 0 && `, ${importStats.updated} actualizados`}.
            </p>
            {importStats.errors.length > 0 && (
              <ul className="mt-1 list-disc list-inside text-xs">
                {importStats.errors.slice(0, 5).map((err, i) => (
                  <li key={i}>
                    Fila {err.row}{err.field ? ` · ${err.field}` : ''}: {err.message}
                  </li>
                ))}
              </ul>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Drop zone */}
      <div
        className={`relative rounded-lg border-2 border-dashed p-8 text-center transition-colors cursor-pointer ${
          dragOver
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 bg-white hover:border-gray-400'
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="Zona de carga de archivo CSV"
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          className="sr-only"
          onChange={handleInputChange}
          aria-label="Seleccionar archivo CSV"
        />

        {selectedFile ? (
          <div className="flex items-center justify-center gap-3">
            <FileText className="h-6 w-6 text-blue-600 flex-shrink-0" />
            <span className="text-sm font-medium text-gray-900 truncate max-w-[200px]">
              {selectedFile.name}
            </span>
            <button
              type="button"
              className="text-gray-400 hover:text-gray-600"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedFile(null);
                if (inputRef.current) inputRef.current.value = '';
              }}
              aria-label="Quitar archivo seleccionado"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <Upload className="mx-auto h-10 w-10 text-gray-400" />
            <p className="text-sm text-gray-600">
              <span className="font-medium text-blue-600">Haz clic</span> o arrastra tu archivo CSV
            </p>
            <p className="text-xs text-gray-400">Formato .csv — Máximo {MAX_FILE_SIZE_MB}MB</p>
          </div>
        )}
      </div>

      {validationError && (
        <Alert variant="destructive">
          <AlertDescription>{validationError}</AlertDescription>
        </Alert>
      )}

      {importMutation.isError && (
        <Alert variant="destructive">
          <AlertTitle>Error al importar</AlertTitle>
          <AlertDescription>
            {importMutation.error instanceof Error
              ? importMutation.error.message
              : 'Ocurrió un error inesperado. Intenta de nuevo.'}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
        <Button type="button" variant="outline" onClick={onBack}>
          ← Anterior
        </Button>
        <div className="flex gap-2">
          {selectedFile && (
            <Button
              type="button"
              variant="outline"
              onClick={handleUpload}
              disabled={importMutation.isPending}
            >
              {importMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Subir archivo
            </Button>
          )}
          <Button
            type="button"
            onClick={onNext}
            disabled={!isCompleted && !importStats}
          >
            Siguiente →
          </Button>
        </div>
      </div>
    </div>
  );
}
