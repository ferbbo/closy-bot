'use client';

/**
 * EmptyChannelsState — REQ-05, AC-08
 * Mostrado cuando el merchant no tiene canales conectados.
 * CTA redirige a /onboarding?flow=add_channel
 */

import Link from 'next/link';
import { MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function EmptyChannelsState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      {/* Icono ilustrativo */}
      <div className="rounded-full bg-gray-100 p-6 mb-6">
        <MessageSquare className="h-12 w-12 text-gray-400" />
      </div>

      <h2 className="text-xl font-semibold text-gray-900 mb-2">
        No tienes canales conectados
      </h2>
      <p className="text-sm text-gray-500 max-w-sm mb-8">
        Conecta tu WhatsApp Business para empezar a recibir pedidos y atender
        clientes desde el chat.
      </p>

      {/* AC-08: CTA → /onboarding?flow=add_channel */}
      <Button asChild>
        <Link href="/onboarding?flow=add_channel">Conectar WhatsApp</Link>
      </Button>
    </div>
  );
}
