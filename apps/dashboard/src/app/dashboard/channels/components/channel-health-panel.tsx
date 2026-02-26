'use client';

/**
 * ChannelHealthPanel — REQ-03, AC-04, AC-05
 *
 * Panel expandible que muestra datos de GET /channels/:id/health.
 * Se monta cuando el usuario expande una ChannelCard.
 */

import { CheckCircle2, XCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { useChannelHealth } from '@/hooks/use-channels';
import { RetryWebhookButton } from './retry-webhook-button';

const RECOMMENDATION_TEXT: Record<string, string> = {
  resubscribe_webhook: 'Reintenta la suscripción del webhook',
  refresh_credentials: 'Actualiza las credenciales del canal',
  check_permissions: 'Revisa los permisos de la aplicación Meta',
};

interface ChannelHealthPanelProps {
  channelId: string;
  status: 'connected' | 'pending' | 'error';
}

export function ChannelHealthPanel({ channelId, status }: ChannelHealthPanelProps) {
  const { data: health, isLoading, error } = useChannelHealth(channelId);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-t border-gray-100 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Cargando estado de salud...</span>
      </div>
    );
  }

  if (error || !health) {
    return (
      <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 text-sm text-gray-500">
        No se pudo cargar el estado de salud.
      </div>
    );
  }

  const recommendation = health.recommendation
    ? (RECOMMENDATION_TEXT[health.recommendation] ?? health.recommendation)
    : null;

  // AC-05: mostrar recommendation si está presente
  // E6: no mostrar RetryWebhookButton si status === 'pending'
  const showRetryButton = status !== 'pending' && !health.webhookSubscribed;

  return (
    <div className="bg-gray-50 border-t border-gray-100 px-4 py-3 space-y-3 text-sm">
      {/* Webhook status */}
      <div className="flex items-center gap-2">
        {health.webhookSubscribed ? (
          <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
        ) : (
          <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
        )}
        <span className="text-gray-700">
          Webhook:{' '}
          <span className={health.webhookSubscribed ? 'text-green-700 font-medium' : 'text-red-600 font-medium'}>
            {health.webhookSubscribed ? 'Suscrito' : 'No suscrito'}
          </span>
        </span>
      </div>

      {/* Error count */}
      <div className="flex items-center gap-2">
        <span className="text-gray-500">Errores recientes:</span>
        <span className={`font-medium ${health.errorCount > 0 ? 'text-red-600' : 'text-green-700'}`}>
          {health.errorCount}
        </span>
      </div>

      {/* Recent errors — max 3 */}
      {health.recentErrors.length > 0 && (
        <div className="space-y-1">
          {health.recentErrors.map((err, i) => (
            <div key={i} className="flex items-start gap-1.5 text-xs text-red-600">
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
              <span>{err}</span>
            </div>
          ))}
        </div>
      )}

      {/* AC-05: recommendation */}
      {recommendation && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-md px-2.5 py-1.5">
          {health.errorCount === 0 && !recommendation
            ? 'Todo OK'
            : recommendation}
        </p>
      )}

      {/* Status OK message */}
      {!recommendation && health.webhookSubscribed && health.errorCount === 0 && (
        <p className="text-xs text-green-700 flex items-center gap-1.5">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Todo OK
        </p>
      )}

      {/* Pending status message (E6) */}
      {status === 'pending' && (
        <p className="text-xs text-amber-700">
          Webhook subscription en proceso (5-10 min)
        </p>
      )}

      {/* RetryWebhookButton — AC-06, AC-07 */}
      {showRetryButton && (
        <div className="pt-1">
          <RetryWebhookButton channelId={channelId} />
        </div>
      )}
    </div>
  );
}
