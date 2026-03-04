'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Stepper, ONBOARDING_STEPS } from '@/components/ui/stepper';
import { Progress } from '@/components/ui/progress';
import { useOnboardingProgress } from '@/hooks/use-onboarding';
import { useAuth } from '@/hooks/use-auth';
import { StepChannel } from './_components/step-channel';
import { StepCatalog } from './_components/step-catalog';
import { StepCustomize } from './_components/step-customize';
import { StepActivate } from './_components/step-activate';

/** AC-09: Onboarding wizard con 4 steps (canal → catálogo → personalización → activar) */
export default function OnboardingPage() {
  const router = useRouter();
  const { merchant, isLoading: authLoading } = useAuth();
  const { data: progress, isLoading: progressLoading } = useOnboardingProgress();
  const [currentStep, setCurrentStep] = useState(1);

  // AC-10: redirect if already active (side effect, not during render)
  useEffect(() => {
    if (!authLoading && merchant?.status === 'active') {
      router.replace('/dashboard');
    }
  }, [authLoading, merchant?.status, router]);

  const completedSteps = progress?.completedSteps ?? [];
  const percentage = progress?.percentage ?? 0;

  const goNext = () => setCurrentStep((s) => Math.min(s + 1, ONBOARDING_STEPS.length));
  const goBack = () => setCurrentStep((s) => Math.max(s - 1, 1));

  // Show loader only on initial load (no data yet) or if already active (redirect in progress)
  if (authLoading || (!progress && progressLoading) || merchant?.status === 'active') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" aria-label="Cargando" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="mx-auto w-full max-w-2xl space-y-8">
        {/* Header */}
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-gray-900">Configura tu tienda</h1>
          <p className="text-sm text-gray-500">
            Completa estos pasos para activar tu tienda en menos de 10 minutos.
          </p>
        </div>

        {/* Progress bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-xs font-medium text-gray-500">
            <span>Progreso de configuración</span>
            <span>{percentage}%</span>
          </div>
          <Progress value={percentage} aria-label={`Progreso ${percentage}%`} />
        </div>

        {/* AC-10: Stepper 4 pasos */}
        <Stepper currentStep={currentStep} completedSteps={completedSteps} />

        {/* Step content */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm min-h-[400px]">
          {currentStep === 1 && (
            <StepChannel completedSteps={completedSteps} onNext={goNext} onBack={goBack} />
          )}
          {currentStep === 2 && (
            <StepCatalog completedSteps={completedSteps} onNext={goNext} onBack={goBack} />
          )}
          {currentStep === 3 && (
            <StepCustomize completedSteps={completedSteps} onNext={goNext} onBack={goBack} />
          )}
          {currentStep === 4 && (
            <StepActivate
              completedSteps={completedSteps}
              percentage={percentage}
              onBack={goBack}
            />
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-400">
          Step {currentStep} de {ONBOARDING_STEPS.length} · Closy Bot Dashboard
        </p>
      </div>
    </div>
  );
}
