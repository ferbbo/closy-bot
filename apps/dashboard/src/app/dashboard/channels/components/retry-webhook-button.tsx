'use client';

/**
 * RetryWebhookButton — REQ-04, AC-06, AC-07
 *
 * - Click ejecuta mutation POST /channels/:id/retry-webhook
 * - Loading state durante la petición
 * - Toast success / error según respuesta
 * - 429 → deshabilita botón por RETRY_COOLDOWN_SECONDS (AC-07, E2)
 */

import { useState, useEffect, useRef } from 'react';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useRetryWebhook } from '@/hooks/use-channels';
import { ApiError } from '@/lib/api';

const RETRY_COOLDOWN_SECONDS = 60;

interface RetryWebhookButtonProps {
  channelId: string;
}

export function RetryWebhookButton({ channelId }: RetryWebhookButtonProps) {
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const mutation = useRetryWebhook(channelId);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const startCooldown = () => {
    setCooldownSeconds(RETRY_COOLDOWN_SECONDS);
    intervalRef.current = setInterval(() => {
      setCooldownSeconds((prev) => {
        if (prev <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleClick = () => {
    mutation.mutate(undefined, {
      onSuccess: (data) => {
        toast.success(data.message || 'Webhook reconectado exitosamente');
      },
      onError: (error) => {
        if (error instanceof ApiError && error.status === 429) {
          // AC-07, E2: Rate limit → mostrar mensaje + iniciar cooldown
          toast.error('Demasiados intentos. Espera 60 segundos.');
          startCooldown();
        } else if (error instanceof ApiError && error.status === 403) {
          toast.error('No tienes permiso para ver este canal');
        } else {
          toast.error(error.message || 'Error al reconectar webhook');
        }
      },
    });
  };

  const isCoolingDown = cooldownSeconds > 0;
  const isDisabled = mutation.isPending || isCoolingDown;

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleClick}
      disabled={isDisabled}
      className="gap-2"
    >
      <RefreshCw
        className={`h-3.5 w-3.5 ${mutation.isPending ? 'animate-spin' : ''}`}
      />
      {isCoolingDown
        ? `Espera ${cooldownSeconds}s`
        : mutation.isPending
          ? 'Reconectando...'
          : 'Retry Webhook'}
    </Button>
  );
}
