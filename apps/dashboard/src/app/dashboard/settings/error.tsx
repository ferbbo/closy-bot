'use client';

/**
 * PR-FE-05: Settings error boundary
 * AC-11: shown on unexpected error loading page
 */
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SettingsErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function SettingsError({ error, reset }: SettingsErrorProps) {
  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto">
      <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
        <AlertTriangle className="h-10 w-10 text-red-500" />
        <h2 className="text-xl font-semibold text-gray-800">
          Error al cargar configuración
        </h2>
        <p className="text-gray-500 max-w-sm">
          {error.message || 'Ocurrió un error inesperado. Intenta de nuevo.'}
        </p>
        <Button onClick={reset} variant="outline">
          Reintentar
        </Button>
      </div>
    </div>
  );
}
