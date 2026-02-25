import * as React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OnboardingStepKey } from '@/lib/api';

export interface StepperStep {
  key: OnboardingStepKey;
  label: string;
  index: number; // 1-based
}

export const ONBOARDING_STEPS: StepperStep[] = [
  { key: 'profile', label: 'Perfil', index: 1 },
  { key: 'channel', label: 'Canal', index: 2 },
  { key: 'catalog', label: 'Catálogo', index: 3 },
  { key: 'config', label: 'Pagos', index: 4 },
  { key: 'test', label: 'Activar', index: 5 },
];

interface StepperProps {
  currentStep: number; // 1-based
  completedSteps: OnboardingStepKey[];
}

export function Stepper({ currentStep, completedSteps }: StepperProps) {
  return (
    <nav aria-label="Progreso de onboarding" className="w-full">
      <ol className="flex items-center justify-between w-full">
        {ONBOARDING_STEPS.map((step, i) => {
          const isCompleted = completedSteps.includes(step.key);
          const isActive = step.index === currentStep;
          const isLast = i === ONBOARDING_STEPS.length - 1;

          return (
            <React.Fragment key={step.key}>
              <li className="flex flex-col items-center gap-1.5 min-w-0">
                {/* Circle icon */}
                <div
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-300',
                    isCompleted
                      ? 'border-green-600 bg-green-600 text-white'
                      : isActive
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-gray-300 bg-white text-gray-400',
                  )}
                  aria-current={isActive ? 'step' : undefined}
                >
                  {isCompleted ? (
                    <Check className="h-4 w-4" strokeWidth={2.5} />
                  ) : (
                    <span className="text-sm font-semibold">{step.index}</span>
                  )}
                </div>

                {/* Label */}
                <span
                  className={cn(
                    'hidden sm:block text-xs font-medium text-center truncate max-w-[64px]',
                    isCompleted
                      ? 'text-green-700'
                      : isActive
                        ? 'text-blue-700'
                        : 'text-gray-400',
                  )}
                >
                  {step.label}
                </span>
              </li>

              {/* Connector line */}
              {!isLast && (
                <div
                  className={cn(
                    'h-0.5 flex-1 mx-1 mt-[-20px] sm:mt-[-22px] transition-colors duration-300',
                    isCompleted ? 'bg-green-400' : 'bg-gray-200',
                  )}
                  aria-hidden="true"
                />
              )}
            </React.Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
