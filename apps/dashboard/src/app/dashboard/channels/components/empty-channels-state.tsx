'use client';

/**
 * EmptyChannelsState — REQ-05 (PR-FE-03), AC-08
 * Mostrado cuando el merchant no tiene canales conectados.
 * GAP-3 REQ-05: Abre popup hacia /onboarding/whatsapp/start y escucha postMessage.
 */

import { useState, useEffect, useRef } from 'react';
import { MessageSquare, ExternalLink, Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const META_SIGNUP_WIDTH = 600;
const META_SIGNUP_HEIGHT = 700;
const POPUP_CLOSE_GRACE_MS = 2000;
const POPUP_POLL_MS = 500;

export function EmptyChannelsState() {
  const [popupBlocked, setPopupBlocked] = useState(false);
  const [waitingConnection, setWaitingConnection] = useState(false);
  const [errorReason, setErrorReason] = useState<string | null>(null);
  const [popupClosedWithoutMessage, setPopupClosedWithoutMessage] = useState(false);
  const [connected, setConnected] = useState(false);

  const popupRef = useRef<Window | null>(null);
  const queryClient = useQueryClient();

  /** AC-05: Same message listener pattern as step-channel.tsx */
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
        // Invalidate channels list to trigger refetch and exit empty state
        void queryClient.invalidateQueries({ queryKey: ['channels'] });
        setWaitingConnection(false);
        setErrorReason(null);
        setPopupClosedWithoutMessage(false);
        setConnected(true);
      } else if (data.type === 'whatsapp-error') {
        setWaitingConnection(false);
        setErrorReason(data.reason ?? 'unknown_error');
        setPopupClosedWithoutMessage(false);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [queryClient]);

  /** Detect popup closed without postMessage (same pattern as step-channel) */
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

  if (connected) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
        <Alert variant="success" className="max-w-sm">
          <AlertTitle>✅ WhatsApp conectado</AlertTitle>
          <AlertDescription>
            Tu canal fue conectado correctamente. Cargando canales…
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center space-y-4">
      {/* Icono ilustrativo */}
      <div className="rounded-full bg-gray-100 p-6">
        <MessageSquare className="h-12 w-12 text-gray-400" />
      </div>

      <h2 className="text-xl font-semibold text-gray-900">
        No tienes canales conectados
      </h2>
      <p className="text-sm text-gray-500 max-w-sm">
        Conecta tu WhatsApp Business para empezar a recibir pedidos y atender
        clientes desde el chat.
      </p>

      {waitingConnection && (
        <div className="flex items-center gap-2 text-sm text-blue-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Esperando conexión… completa el proceso en la ventana emergente.</span>
        </div>
      )}

      {/* AC-05: Popup opener button (not Link redirect) */}
      <Button onClick={handleConnectWhatsApp}>
        <ExternalLink className="h-4 w-4 mr-2" />
        {waitingConnection ? 'Reabrir ventana de WhatsApp' : 'Conectar WhatsApp'}
      </Button>

      {popupClosedWithoutMessage && (
        <Alert variant="info" className="max-w-sm">
          <AlertTitle>No completaste la conexión</AlertTitle>
          <AlertDescription>
            Haz clic en &ldquo;Conectar WhatsApp&rdquo; si deseas reintentar.
          </AlertDescription>
        </Alert>
      )}

      {errorReason && (
        <Alert variant="destructive" className="max-w-sm">
          <AlertTitle>Error al conectar WhatsApp</AlertTitle>
          <AlertDescription>
            Hubo un problema ({errorReason}). Intenta de nuevo.
          </AlertDescription>
        </Alert>
      )}

      {popupBlocked && (
        <Alert variant="destructive" className="max-w-sm">
          <AlertTitle>Ventana emergente bloqueada</AlertTitle>
          <AlertDescription>
            Permite los popups para este sitio en la barra de direcciones y vuelve a intentarlo.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

