'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useSavePaymentConfig } from '@/hooks/use-onboarding';
import type { OnboardingStepKey } from '@/lib/api';

const paymentsSchema = z
  .object({
    acceptsCash: z.boolean(),
    acceptsTransfer: z.boolean(),
    acceptsPaymentLink: z.boolean(),
    bankName: z.string().optional(),
    bankAccount: z.string().optional(),
    bankHolder: z.string().optional(),
  })
  .refine((data) => data.acceptsCash || data.acceptsTransfer || data.acceptsPaymentLink, {
    message: 'Debes seleccionar al menos un método de pago.',
    path: ['acceptsCash'],
  });

type PaymentsFormValues = z.infer<typeof paymentsSchema>;

interface StepPaymentsProps {
  completedSteps: OnboardingStepKey[];
  onNext: () => void;
  onBack: () => void;
}

export function StepPayments({ completedSteps, onNext, onBack }: StepPaymentsProps) {
  const isCompleted = completedSteps.includes('config');
  const saveMutation = useSavePaymentConfig();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<PaymentsFormValues>({
    resolver: zodResolver(paymentsSchema),
    defaultValues: {
      acceptsCash: true,
      acceptsTransfer: false,
      acceptsPaymentLink: false,
    },
  });

  const showTransferFields = watch('acceptsTransfer');

  const onSubmit = async (data: PaymentsFormValues) => {
    try {
      await saveMutation.mutateAsync(data);
    } catch {
      // error shown in alert
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Métodos de pago</h2>
        <p className="mt-1 text-sm text-gray-500">
          Configura cómo tus clientes podrán pagarte.
        </p>
      </div>

      {isCompleted && !saveMutation.isSuccess && (
        <Alert variant="success">
          <AlertDescription>
            ✅ Métodos de pago ya configurados. Puedes actualizar si lo necesitas.
          </AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium text-gray-700">
            Selecciona los métodos que aceptas <span className="text-red-500">*</span>
          </legend>

          {[
            { name: 'acceptsCash' as const, label: 'Efectivo / Pago contra entrega' },
            { name: 'acceptsTransfer' as const, label: 'Transferencia bancaria' },
            { name: 'acceptsPaymentLink' as const, label: 'Link de pago (MercadoPago, Stripe, etc.)' },
          ].map(({ name, label }) => (
            <label key={name} className="flex items-center gap-3 cursor-pointer">
              <input
                {...register(name)}
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-600"
              />
              <span className="text-sm text-gray-700">{label}</span>
            </label>
          ))}

          {errors.acceptsCash?.message && (
            <p className="text-sm text-red-600">{errors.acceptsCash.message}</p>
          )}
        </fieldset>

        {showTransferFields && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
            <p className="text-sm font-medium text-gray-700">Datos bancarios (opcionales)</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs text-gray-500 mb-1" htmlFor="bankName">
                  Banco
                </label>
                <input
                  {...register('bankName')}
                  id="bankName"
                  type="text"
                  placeholder="Ej: Banco XYZ"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1" htmlFor="bankAccount">
                  Número de cuenta / CBU / CLABE
                </label>
                <input
                  {...register('bankAccount')}
                  id="bankAccount"
                  type="text"
                  placeholder="Ej: 123456789012"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-gray-500 mb-1" htmlFor="bankHolder">
                  Titular de la cuenta
                </label>
                <input
                  {...register('bankHolder')}
                  id="bankHolder"
                  type="text"
                  placeholder="Ej: María García"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        )}

        {saveMutation.isError && (
          <Alert variant="destructive">
            <AlertTitle>Error al guardar</AlertTitle>
            <AlertDescription>
              {saveMutation.error instanceof Error
                ? saveMutation.error.message
                : 'No se pudo guardar la configuración. Intenta de nuevo.'}
            </AlertDescription>
          </Alert>
        )}

        {saveMutation.isSuccess && (
          <Alert variant="success">
            <AlertDescription>✅ Métodos de pago guardados correctamente.</AlertDescription>
          </Alert>
        )}

        <div className="flex justify-between gap-3">
          <Button type="button" variant="outline" onClick={onBack}>
            ← Anterior
          </Button>
          <div className="flex gap-2">
            <Button type="submit" variant="outline" disabled={saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Guardar
            </Button>
            <Button
              type="button"
              onClick={onNext}
              disabled={!isCompleted && !saveMutation.isSuccess}
            >
              Siguiente →
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
