'use client';

import { Package, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EmptyCatalogStateProps {
  onImportClick: () => void;
}

/** AC-09: Empty state with CTA when merchant has no products */
export function EmptyCatalogState({ onImportClick }: EmptyCatalogStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="rounded-full bg-gray-100 p-5 mb-4">
        <Package className="h-12 w-12 text-gray-400" />
      </div>
      <h2 className="text-lg font-semibold text-gray-900 mb-2">
        No tienes productos en tu catálogo
      </h2>
      <p className="text-sm text-gray-500 max-w-sm mb-6">
        Importa tu catálogo en formato CSV para que tus clientes puedan ver y comprar tus
        productos a través de WhatsApp.
      </p>
      <Button onClick={onImportClick} className="gap-2">
        <ArrowDown className="h-4 w-4" />
        Importar catálogo CSV
      </Button>
      <p className="mt-4 text-xs text-gray-400">
        ¿Tienes una plantilla? Descarga el{' '}
        <a
          href="/examples/catalog-template.csv"
          download
          className="underline hover:text-gray-600"
        >
          ejemplo de CSV
        </a>
      </p>
    </div>
  );
}
