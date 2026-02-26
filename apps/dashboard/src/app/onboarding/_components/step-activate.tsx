'use client';

import { useRouter } from 'next/navigation';
import { Loader2, Rocket, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useActivateMerchant } from '@/hooks/use-onboarding';
import type { OnboardingStepKey } from '@/lib/api';

const STEP_LABELS: Record<OnboardingStepKey, string> = {
  channel: 'Canal WhatsApp conectado',
  catalog: 'Catálogo importado',
  config: 'Tienda personalizada',
  test: 'Listo para activar',
};

interface StepActivateProps {
  completedSteps: OnboardingStepKey[];
  percentage: number;
  onBack: () => void;
}

export function StepActivate({ completedSteps, percentage, onBack }: StepActivateProps) {
  const router = useRouter();
  const activateMutation = useActivateMerchant();

  const requiredSteps: OnboardingStepKey[] = ['channel', 'catalog', 'config'];
  const missingSteps = requiredSteps.filter((s) => !completedSteps.includes(s));
  const canActivate = missingSteps.length === 0;

  const handleActivate = async () => {
    try {
      await activateMutation.mutateAsync();
      toast.success('¡Tienda activada!', {
        description: 'Tu tienda está lista para recibir pedidos por WhatsApp.',
      });
      router.replace('/dashboard');
    } catch {
      // error shown in alert below
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Prueba y activa tu tienda</h2>
        <p className="mt-1 text-sm text-gray-500">
          Verifica que todo esté en orden antes de activar.
        </p>
      </div>

      {/* Checklist */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-2">
        <p className="text-sm font-medium text-gray-700 mb-3">Requisitos de activación</p>
        {requiredSteps.map((step) => {
          const done = completedSteps.includes(step);
          return (
            <div key={step} className="flex items-center gap-3">
              {done ? (
                <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
              ) : (
                <div className="h-4 w-4 rounded-full border-2 border-gray-300 flex-shrink-0" />
              )}
              <span
                className={`text-sm ${done ? 'text-gray-700' : 'text-gray-400 line-through'}`}
              >
                {STEP_LABELS[step]}
              </span>
              <Badge variant={done ? 'success' : 'pending'} className="ml-auto">
                {done ? 'Listo' : 'Pendiente'}
              </Badge>
            </div>
          );
        })}
      </div>

      {/* Test instructions */}
      <Alert variant="info">
        <AlertTitle>🧪 Prueba tu bot antes de activar</AlertTitle>
        <AlertDescription className="space-y-2">
          <p>
            Envía un mensaje de prueba a tu número de WhatsApp Business desde otro teléfono. Por
            ejemplo, escribe <strong>&ldquo;Hola&rdquo;</strong> o <strong>&ldquo;Ver productos&rdquo;</strong>.
          </p>
          <p className="text-xs text-blue-700">
            El bot debería responder automáticamente con el saludo de bienvenida.
          </p>
        </AlertDescription>
      </Alert>

      {/* Missing requirements error */}
      {!canActivate && (
        <Alert variant="destructive">
          <AlertTitle>Faltan requisitos para activar</AlertTitle>
          <AlertDescription>
            <ul className="mt-1 list-disc list-inside">
              {missingSteps.map((s) => (
                <li key={s}>{STEP_LABELS[s]}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {activateMutation.isError && (
        <Alert variant="destructive">
          <AlertTitle>Error al activar</AlertTitle>
          <AlertDescription>
            {activateMutation.error instanceof Error
              ? activateMutation.error.message
              : 'No se pudo activar la tienda. Verifica los requisitos e intenta de nuevo.'}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex justify-between gap-3">
        <Button type="button" variant="outline" onClick={onBack}>
          ← Anterior
        </Button>
        <Button
          type="button"
          onClick={handleActivate}
          disabled={!canActivate || activateMutation.isPending}
          className="bg-green-600 hover:bg-green-700 disabled:opacity-50"
          size="lg"
        >
          {activateMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Rocket className="h-4 w-4 mr-2" />
          )}
          ¡Activar tienda! ({percentage}% completado)
        </Button>
      </div>
    </div>
  );
}
