'use client';

import { useState, useEffect, useRef } from 'react';
import { ExternalLink, MessageCircle, Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { OnboardingStepKey } from '@/lib/api';

const META_SIGNUP_WIDTH = 600;
const META_SIGNUP_HEIGHT = 700;
/** Delay after popup closes to wait for any in-flight postMessage (AC-04) */
const POPUP_CLOSE_GRACE_MS = 2000;
/** Poll interval to detect manual popup close */
const POPUP_POLL_MS = 500;

interface StepChannelProps {
  completedSteps: OnboardingStepKey[];
  onNext: () => void;
  onBack: () => void;
}

export function StepChannel({ completedSteps, onNext, onBack }: StepChannelProps) {
  const isCompleted = completedSteps.includes('channel');
  const [popupBlocked, setPopupBlocked] = useState(false);
  const [waitingConnection, setWaitingConnection] = useState(false);
  const [errorReason, setErrorReason] = useState<string | null>(null);
  const [popupClosedWithoutMessage, setPopupClosedWithoutMessage] = useState(false);

  const popupRef = useRef<Window | null>(null);
  const queryClient = useQueryClient();

  /**
   * AC-02: Register message listener for popup → parent communication.
   * AC-03: On 'whatsapp-connected' → invalidate onboarding progress + advance.
   * Security: validate event.origin against NEXT_PUBLIC_API_URL.
   */
  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
    const expectedOrigin = (() => {
      try {
        return new URL(apiUrl).origin;
      } catch {
        return apiUrl;
      }
    })();

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== expectedOrigin) return;

      const data = event.data as { type: string; channelId?: string; reason?: string };

      if (data.type === 'whatsapp-connected') {
        // AC-03: Invalidate onboarding progress and advance step
        void queryClient.invalidateQueries({ queryKey: ['onboarding', 'progress'] });
        setWaitingConnection(false);
        setErrorReason(null);
        setPopupClosedWithoutMessage(false);
        onNext();
      } else if (data.type === 'whatsapp-error') {
        setWaitingConnection(false);
        setErrorReason(data.reason ?? 'unknown_error');
        setPopupClosedWithoutMessage(false);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [queryClient, onNext]);

  /**
   * AC-04: Detect popup closed manually without sending a postMessage.
   * Poll every POPUP_POLL_MS; on close, wait POPUP_CLOSE_GRACE_MS then fallback.
   */
  useEffect(() => {
    if (!waitingConnection || !popupRef.current) return;

    const interval = setInterval(() => {
      if (popupRef.current?.closed) {
        clearInterval(interval);
        setTimeout(() => {
          setWaitingConnection((prev) => {
            if (prev) {
              setPopupClosedWithoutMessage(true);
              return false;
            }
            return prev;
          });
        }, POPUP_CLOSE_GRACE_MS);
      }
    }, POPUP_POLL_MS);

    return () => clearInterval(interval);
  }, [waitingConnection]);

  const handleConnectWhatsApp = () => {
    setPopupBlocked(false);
    setErrorReason(null);
    setPopupClosedWithoutMessage(false);

    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
    // AC-01: Corrected URL — was /channels/meta/embedded-signup
    const signupUrl = `${apiUrl}/onboarding/whatsapp/start`;

    const left = window.screenX + (window.outerWidth - META_SIGNUP_WIDTH) / 2;
    const top = window.screenY + (window.outerHeight - META_SIGNUP_HEIGHT) / 2;

    const popup = window.open(
      signupUrl,
      'meta_embedded_signup',
      `width=${META_SIGNUP_WIDTH},height=${META_SIGNUP_HEIGHT},left=${left},top=${top},resizable=yes,scrollbars=yes`,
    );

    if (!popup) {
      setPopupBlocked(true);
    } else {
      popupRef.current = popup;
      setWaitingConnection(true);
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
            <h3 className="text-base font-medium text-gray-900">
              Conexión vía Meta Embedded Signup
            </h3>
            <p className="mt-2 text-sm text-gray-500">
              Serás dirigido a la plataforma de Meta para autorizar el acceso a tu número de
              WhatsApp Business. El proceso toma menos de 2 minutos.
            </p>
          </div>

          {/* P2: "Esperando conexión..." feedback visual after click */}
          {waitingConnection && !isCompleted && (
            <div className="flex items-center justify-center gap-2 text-sm text-blue-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>
                Esperando conexión con Meta… completa el proceso en la ventana emergente.
              </span>
            </div>
          )}

          <Button
            onClick={handleConnectWhatsApp}
            size="lg"
            className="w-full sm:w-auto bg-green-600 hover:bg-green-700"
          >
            <ExternalLink className="h-4 w-4 mr-2" />
            {waitingConnection ? 'Reabrir ventana de WhatsApp' : 'Conectar WhatsApp'}
          </Button>
        </div>
      )}

      {/* AC-04: Popup closed without receiving a result */}
      {popupClosedWithoutMessage && (
        <Alert variant="info">
          <AlertTitle>No completaste la conexión</AlertTitle>
          <AlertDescription>
            No completaste la conexión. Haz clic en &ldquo;Conectar WhatsApp&rdquo; si deseas
            reintentar.
          </AlertDescription>
        </Alert>
      )}

      {/* Error received from backend via postMessage */}
      {errorReason && (
        <Alert variant="destructive">
          <AlertTitle>Error al conectar WhatsApp</AlertTitle>
          <AlertDescription>
            Hubo un problema al conectar WhatsApp ({errorReason}). Intenta de nuevo.
          </AlertDescription>
        </Alert>
      )}

      {/* P2 fix: Alert component instead of window.alert() */}
      {popupBlocked && (
        <Alert variant="destructive">
          <AlertTitle>Ventana emergente bloqueada</AlertTitle>
          <AlertDescription>
            Tu navegador bloqueó el popup de Meta. Para continuar:
            <ol className="mt-2 list-decimal list-inside space-y-1 text-sm">
              <li>Haz clic en el ícono 🔒 en la barra de direcciones.</li>
              <li>Selecciona &ldquo;Permitir ventanas emergentes&rdquo; para este sitio.</li>
              <li>Vuelve a hacer clic en &ldquo;Conectar WhatsApp&rdquo;.</li>
            </ol>
          </AlertDescription>
        </Alert>
      )}

      {!isCompleted && !popupBlocked && !waitingConnection && !errorReason && !popupClosedWithoutMessage && (
        <Alert variant="info">
          <AlertDescription>
            <span className="font-medium">Tip:</span> Si el popup no abre, verifica que los
            popups estén permitidos para este sitio en la barra de direcciones del navegador.
          </AlertDescription>
        </Alert>
      )}

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
