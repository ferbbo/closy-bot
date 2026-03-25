import { Package } from 'lucide-react';
import Link from 'next/link';

/**
 * EmptyOrdersState
 * AC-09: Muestra estado vacío cuando no hay pedidos
 */
export function EmptyOrdersState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 rounded-full bg-gray-100 p-6">
        <Package className="h-12 w-12 text-gray-400" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">
        No tienes pedidos aún
      </h3>
      <p className="text-sm text-gray-500 mb-6 max-w-xs">
        Cuando tus clientes realicen pedidos por WhatsApp, aparecerán aquí para
        que puedas gestionarlos.
      </p>
      <Link
        href="/dashboard/catalog"
        className="text-sm font-medium text-blue-600 hover:underline"
      >
        Ver catálogo →
      </Link>
    </div>
  );
}
