'use client';

import { ExternalLink, MessageCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { OnboardingStepKey } from '@/lib/api';

const META_SIGNUP_WIDTH = 600;
const META_SIGNUP_HEIGHT = 700;

interface StepChannelProps {
  completedSteps: OnboardingStepKey[];
  onNext: () => void;
  onBack: () => void;
}

export function StepChannel({ completedSteps, onNext, onBack }: StepChannelProps) {
  const isCompleted = completedSteps.includes('channel');

  const handleConnectWhatsApp = () => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
    const signupUrl = `${apiUrl}/channels/meta/embedded-signup`;

    const left = window.screenX + (window.outerWidth - META_SIGNUP_WIDTH) / 2;
    const top = window.screenY + (window.outerHeight - META_SIGNUP_HEIGHT) / 2;

    const popup = window.open(
      signupUrl,
      'meta_embedded_signup',
      `width=${META_SIGNUP_WIDTH},height=${META_SIGNUP_HEIGHT},left=${left},top=${top},resizable=yes,scrollbars=yes`,
    );

    if (!popup) {
      alert(
        'El popup fue bloqueado por el navegador. Permite popups para este sitio e intenta de nuevo.',
      );
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Conecta tu canal WhatsApp</h2>
        <p className="mt-1 text-sm text-gray-500">
          Vincula tu número de WhatsApp Business para empezar a recibir pedidos.
        </p>
      </div>

      {isCompleted ? (
        <Alert variant="success">
          <AlertTitle>✅ WhatsApp conectado</AlertTitle>
          <AlertDescription>
            Tu canal de WhatsApp Business ya está configurado correctamente.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-5 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
            <MessageCircle className="h-7 w-7 text-green-600" />
          </div>
          <div>
            <h3 className="text-base font-medium text-gray-900">Conexión vía Meta Embedded Signup</h3>
            <p className="mt-2 text-sm text-gray-500">
              Serás dirigido a la plataforma de Meta para autorizar el acceso a tu número de
              WhatsApp Business. El proceso toma menos de 2 minutos.
            </p>
          </div>

          <Button
            onClick={handleConnectWhatsApp}
            size="lg"
            className="w-full sm:w-auto bg-green-600 hover:bg-green-700"
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            Conectar WhatsApp
          </Button>
        </div>
      )}

      <Alert variant="info">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          <span className="font-medium">¿El popup no abre?</span> Asegúrate de permitir popups
          en tu navegador para este sitio. Puedes hacerlo en la barra de direcciones, junto al ícono
          🔒.
        </AlertDescription>
      </Alert>

      <div className="flex justify-between gap-3">
        <Button type="button" variant="outline" onClick={onBack}>
          ← Anterior
        </Button>
        <Button type="button" onClick={onNext} disabled={!isCompleted}>
          Siguiente →
        </Button>
      </div>
    </div>
  );
}
