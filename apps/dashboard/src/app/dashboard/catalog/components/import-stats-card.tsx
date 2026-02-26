'use client';

import { useState } from 'react';
import { CheckCircle2, RefreshCw, AlertTriangle, ChevronDown, ChevronUp, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ImportStats } from '@/lib/api';

interface ImportStatsCardProps {
  stats: ImportStats;
  onDismiss: () => void;
}

export function ImportStatsCard({ stats, onDismiss }: ImportStatsCardProps) {
  const [expanded, setExpanded] = useState(false);
  const hasErrors = stats.errors.length > 0;

  return (
    <div
      className={cn(
        'rounded-lg border p-4',
        hasErrors ? 'border-yellow-200 bg-yellow-50' : 'border-green-200 bg-green-50',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {hasErrors ? (
            <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0" />
          ) : (
            <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
          )}
          <p className={cn('text-sm font-medium', hasErrors ? 'text-yellow-800' : 'text-green-800')}>
            {hasErrors
              ? `${stats.created + stats.updated} productos importados con ${stats.errors.length} error${stats.errors.length !== 1 ? 'es' : ''}`
              : `Importación completada correctamente`}
          </p>
        </div>
        <button
          onClick={onDismiss}
          className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Cerrar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Stats row */}
      <div className="mt-3 flex flex-wrap gap-2">
        {stats.created > 0 && (
          <Badge variant="outline" className="border-green-300 text-green-700 bg-green-50">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            {stats.created} nuevo{stats.created !== 1 ? 's' : ''}
          </Badge>
        )}
        {stats.updated > 0 && (
          <Badge variant="outline" className="border-blue-300 text-blue-700 bg-blue-50">
            <RefreshCw className="h-3 w-3 mr-1" />
            {stats.updated} actualizado{stats.updated !== 1 ? 's' : ''}
          </Badge>
        )}
        {hasErrors && (
          <Badge variant="outline" className="border-yellow-300 text-yellow-700 bg-yellow-50">
            <AlertTriangle className="h-3 w-3 mr-1" />
            {stats.errors.length} error{stats.errors.length !== 1 ? 'es' : ''}
          </Badge>
        )}
      </div>

      {/* Error detail toggle */}
      {hasErrors && (
        <div className="mt-3">
          <Button
            variant="ghost"
            size="sm"
            className="h-auto p-0 text-yellow-700 hover:text-yellow-900 hover:bg-transparent text-xs"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <>
                <ChevronUp className="h-3 w-3 mr-1" />
                Ocultar errores
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3 mr-1" />
                Ver detalle de errores
              </>
            )}
          </Button>

          {expanded && (
            <ul className="mt-2 space-y-1 max-h-40 overflow-y-auto">
              {stats.errors.map((err, i) => (
                <li key={i} className="text-xs text-yellow-800 bg-white rounded px-2 py-1 border border-yellow-100">
                  <span className="font-medium">Fila {err.row}</span>
                  {err.field && <span className="text-yellow-600"> · {err.field}</span>}
                  {' — '}{err.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
