'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useApplyPreset } from '@/hooks/use-onboarding';
import type { OnboardingStepKey } from '@/lib/api';

const profileSchema = z.object({
  industry: z.enum(['ropa', 'belleza', 'minimarket'] as const, {
    error: 'Selecciona una industria',
  }),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

const INDUSTRIES: { value: ProfileFormValues['industry']; label: string; description: string }[] = [
  { value: 'ropa', label: '👗 Ropa y moda', description: 'Tiendas de ropa, calzado, accesorios' },
  { value: 'belleza', label: '💄 Belleza', description: 'Cosmética, cuidado personal, salones' },
  {
    value: 'minimarket',
    label: '🛒 Minimarket',
    description: 'Abarrotes, alimentos, bebidas',
  },
];

interface StepProfileProps {
  merchantName: string;
  merchantEmail: string;
  completedSteps: OnboardingStepKey[];
  onNext: () => void;
}

export function StepProfile({
  merchantName,
  merchantEmail,
  completedSteps,
  onNext,
}: StepProfileProps) {
  const isCompleted = completedSteps.includes('profile');
  const applyPreset = useApplyPreset();
  const [presetApplied, setPresetApplied] = useState(isCompleted);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
  });

  const selectedIndustry = watch('industry');

  const onSubmit = async (data: ProfileFormValues) => {
    try {
      await applyPreset.mutateAsync({ industry: data.industry });
      setPresetApplied(true);
    } catch {
      // error shown in alert
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Perfil de tu negocio</h2>
        <p className="mt-1 text-sm text-gray-500">
          Cuéntanos sobre tu negocio para personalizar tu experiencia.
        </p>
      </div>

      {/* Read-only merchant info */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Negocio</p>
          <p className="mt-1 text-sm font-medium text-gray-900">{merchantName}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Email</p>
          <p className="mt-1 text-sm text-gray-700">{merchantEmail}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div>
          <p className="text-sm font-medium text-gray-700 mb-3">
            ¿En qué industria opera tu negocio? <span className="text-red-500">*</span>
          </p>

          <div className="grid gap-3 sm:grid-cols-3">
            {INDUSTRIES.map(({ value, label, description }) => {
              const isSelected = selectedIndustry === value;
              return (
                <label
                  key={value}
                  className={`relative flex cursor-pointer rounded-lg border p-4 shadow-sm transition-colors ${
                    isSelected
                      ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-600'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <input
                    {...register('industry')}
                    type="radio"
                    value={value}
                    className="sr-only"
                    aria-label={label}
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{label}</p>
                    <p className="mt-0.5 text-xs text-gray-500">{description}</p>
                  </div>
                  {isSelected && (
                    <div className="flex-shrink-0 w-4 h-4 rounded-full bg-blue-600 mt-0.5" />
                  )}
                </label>
              );
            })}
          </div>

          {errors.industry && (
            <p className="mt-2 text-sm text-red-600">{errors.industry.message}</p>
          )}
        </div>

        {applyPreset.isError && (
          <Alert variant="destructive">
            <AlertTitle>Error al aplicar preset</AlertTitle>
            <AlertDescription>
              {applyPreset.error instanceof Error
                ? applyPreset.error.message
                : 'Ocurrió un error. Intenta de nuevo.'}
            </AlertDescription>
          </Alert>
        )}

        {presetApplied && !applyPreset.isError && (
          <Alert variant="success">
            <AlertDescription>
              ✅ Preset de industria aplicado correctamente.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex justify-end gap-3">
          <Button
            type="submit"
            variant="outline"
            disabled={!selectedIndustry || applyPreset.isPending}
          >
            {applyPreset.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Aplicar preset de industria
          </Button>

          <Button
            type="button"
            onClick={onNext}
            disabled={!presetApplied && !isCompleted}
          >
            Siguiente →
          </Button>
        </div>
      </form>
    </div>
  );
}
