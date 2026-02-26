'use client';

/**
 * Channels Page — PR-FE-03
 *
 * REQ-01: Lista canales desde GET /channels
 * REQ-02: ChannelCard con status badges
 * REQ-05: EmptyChannelsState cuando channels.length === 0
 * REQ-06: Feature flag gating para multi-channel
 * REQ-07: Error handling (401, 403, 429, network)
 * REQ-08: Loading states con Skeleton
 */

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useChannels } from '@/hooks/use-channels';
import { useFeatures } from '@/hooks/use-features';
import { ApiError } from '@/lib/api';

import { ChannelCard } from './components/channel-card';
import { EmptyChannelsState } from './components/empty-channels-state';

// ─── Skeleton loader — AC-11 ──────────────────────────────────────────────────

function ChannelCardSkeleton() {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 flex items-center gap-4">
      <Skeleton className="h-10 w-10 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-3 w-32" />
      </div>
      <Skeleton className="h-4 w-4" />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ChannelsPage() {
  const router = useRouter();
  const features = useFeatures();

  const { data: channels, isLoading, error, refetch } = useChannels();

  // AC-10: 401 → el middleware ya maneja redirect, pero como fallback explícito:
  useEffect(() => {
    if (error instanceof ApiError && error.status === 401) {
      router.replace('/login');
    }
  }, [error, router]);

  // ─── Loading state — AC-11 ─────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen p-4 sm:p-8 bg-gray-50">
        <div className="max-w-2xl mx-auto">
          <div className="mb-8">
            <Skeleton className="h-8 w-40 mb-2" />
            <Skeleton className="h-4 w-64" />
          </div>
          <div className="space-y-3">
            <ChannelCardSkeleton />
            <ChannelCardSkeleton />
          </div>
        </div>
      </div>
    );
  }

  // ─── Error state — AC-10 (403 + network) ──────────────────────────────────
  if (error) {
    const is403 = error instanceof ApiError && error.status === 403;

    return (
      <div className="min-h-screen p-4 sm:p-8 bg-gray-50">
        <div className="max-w-2xl mx-auto">
          <div className="rounded-lg border border-red-200 bg-red-50 p-6 flex flex-col items-center text-center gap-4">
            <AlertTriangle className="h-8 w-8 text-red-500" />
            <div>
              <p className="font-medium text-red-800">
                {is403 ? 'No tienes acceso a esta sección' : 'Error de conexión'}
              </p>
              <p className="text-sm text-red-600 mt-1">
                {is403
                  ? 'Contacta al administrador si crees que es un error.'
                  : 'No se pudo cargar la lista de canales. Reintentando...'}
              </p>
            </div>
            {!is403 && (
              <Button variant="outline" size="sm" onClick={() => void refetch()} className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Reintentar
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── Empty state — AC-08 ───────────────────────────────────────────────────
  if (!channels || channels.length === 0) {
    return (
      <div className="min-h-screen p-4 sm:p-8 bg-gray-50">
        <div className="max-w-2xl mx-auto">
          <PageHeader showAddButton={false} features={features} />
          <EmptyChannelsState />
        </div>
      </div>
    );
  }

  // ─── Happy path — AC-01, AC-03 ─────────────────────────────────────────────
  return (
    <div className="min-h-screen p-4 sm:p-8 bg-gray-50">
      <div className="max-w-2xl mx-auto">
        <PageHeader showAddButton features={features} />

        {/* AC-01: lista de channels */}
        <div className="space-y-3">
          {channels.map((channel) => (
            <ChannelCard key={channel.id} channel={channel} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── PageHeader ───────────────────────────────────────────────────────────────

interface PageHeaderProps {
  showAddButton: boolean;
  features: ReturnType<typeof useFeatures>;
}

function PageHeader({ showAddButton, features }: PageHeaderProps) {
  const router = useRouter();

  return (
    <div className="flex items-center justify-between mb-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Canales</h1>
        <p className="text-sm text-gray-500 mt-1">
          Gestiona tus canales de comunicación con clientes
        </p>
      </div>

      {/* AC-09: botón "Conectar otro canal" solo visible si isMultiChannelEnabled */}
      {showAddButton && features.isMultiChannelEnabled && (
        <Button onClick={() => router.push('/onboarding?flow=add_channel')}>
          Conectar otro canal
        </Button>
      )}
    </div>
  );
}
