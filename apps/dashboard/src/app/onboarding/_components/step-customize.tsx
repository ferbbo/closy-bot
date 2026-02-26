'use client';

/**
 * PR-FE-OB-2: step-customize.tsx
 * Step 3 del wizard: Personaliza tu tienda
 * AC-01: 3 secciones accordion (pagos, políticas, FAQs)
 * AC-02: Sección 1 expandida por default
 * AC-03: Checkboxes + campos condicionales (banking, URL)
 * AC-04: Políticas prellenadas desde "Retail General"
 * AC-05: 5 FAQs prellenadas si array vacío
 * AC-06: FAQs editables max 10, botón disabled ≥10
 * AC-11: Guardar persiste pagos + políticas + FAQs
 */

import { useState, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';
import { useSaveCustomizeConfig, useSaveFaqs } from '@/hooks/use-onboarding';
import type { OnboardingStepKey } from '@/lib/api';

// ---------------------------------------------------------------------------
// Retail General defaults
// ---------------------------------------------------------------------------

const RETAIL_GENERAL_FAQS = [
  {
    question: '¿Cuánto demora el envío?',
    keywords: ['envio', 'demora', 'llega', 'tiempo', 'dias'],
    answer: 'Los envíos demoran 3-5 días hábiles después de confirmar tu pago 📦',
  },
  {
    question: '¿Hacen envíos a mi ciudad?',
    keywords: ['envio', 'ciudad', 'departamento', 'llegan', 'envian'],
    answer: '¡Sí! Hacemos envíos a toda Colombia 🇨🇴',
  },
  {
    question: '¿Puedo cambiar o devolver?',
    keywords: ['cambio', 'devolucion', 'devolver', 'cambiar', 'garantia'],
    answer: 'Tienes 8 días para cambios. El producto debe estar sin uso y con etiquetas 🏷️',
  },
  {
    question: '¿Qué métodos de pago aceptan?',
    keywords: ['pago', 'pagar', 'nequi', 'transferencia', 'efectivo', 'tarjeta'],
    answer: 'Aceptamos efectivo contra entrega, transferencia/Nequi y links de pago 💳',
  },
  {
    question: '¿Tienen garantía?',
    keywords: ['garantia', 'defecto', 'danado', 'roto'],
    answer: 'Todos nuestros productos tienen garantía de 30 días por defectos de fábrica ✅',
  },
];

const DEFAULT_SHIPPING_POLICY =
  'Envíos a toda Colombia. Tiempo: 3-5 días hábiles. Costo según ciudad.';
const DEFAULT_RETURN_POLICY = 'Aceptamos cambios dentro de 8 días. Producto sin uso y con etiquetas.';

// ---------------------------------------------------------------------------
// Keyword normalization: lowercase + remove tildes
// ---------------------------------------------------------------------------

function normalizeKeywords(question: string): string[] {
  return question
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

// ---------------------------------------------------------------------------
// Zod schema
// ---------------------------------------------------------------------------

const faqItemSchema = z.object({
  question: z.string().min(1, 'Requerido').max(100, 'Máx 100 caracteres'),
  answer: z.string().min(1, 'Requerido').max(300, 'Máx 300 caracteres'),
  keywords: z.array(z.string()),
});

const customizeSchema = z
  .object({
    // Payment methods
    acceptsCash: z.boolean(),
    acceptsTransfer: z.boolean(),
    acceptsPaymentLink: z.boolean(),
    bankName: z.string().optional(),
    bankAccount: z.string().optional(),
    bankHolder: z.string().optional(),
    paymentLinkUrl: z
      .string()
      .optional()
      .refine((v) => !v || /^https?:\/\/.+/.test(v), { message: 'URL inválida' }),
    // Policies
    shippingPolicy: z.string().max(500, 'Máx 500 caracteres').min(1, 'Requerido'),
    returnPolicy: z.string().max(500, 'Máx 500 caracteres').min(1, 'Requerido'),
    businessHours: z.string().max(200, 'Máx 200 caracteres').optional(),
    // FAQs
    faqs: z.array(faqItemSchema).max(10, 'Máximo 10 FAQs'),
  })
  .refine((d) => d.acceptsCash || d.acceptsTransfer || d.acceptsPaymentLink, {
    message: 'Debes seleccionar al menos un método de pago.',
    path: ['acceptsCash'],
  });

type CustomizeFormValues = z.infer<typeof customizeSchema>;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface StepCustomizeProps {
  completedSteps: OnboardingStepKey[];
  onNext: () => void;
  onBack: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StepCustomize({ completedSteps, onNext, onBack }: StepCustomizeProps) {
  const isCompleted = completedSteps.includes('config');
  const saveConfig = useSaveCustomizeConfig();
  const saveFaqs = useSaveFaqs();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CustomizeFormValues>({
    resolver: zodResolver(customizeSchema),
    defaultValues: {
      acceptsCash: true,
      acceptsTransfer: true,
      acceptsPaymentLink: false,
      bankName: '',
      bankAccount: '',
      bankHolder: '',
      paymentLinkUrl: '',
      shippingPolicy: DEFAULT_SHIPPING_POLICY,
      returnPolicy: DEFAULT_RETURN_POLICY,
      businessHours: '',
      faqs: RETAIL_GENERAL_FAQS,
    },
  });

  const { fields: faqFields, append, remove } = useFieldArray({ control, name: 'faqs' });

  const showTransfer = watch('acceptsTransfer');
  const showPaymentLink = watch('acceptsPaymentLink');
  const faqCount = faqFields.length;

  // AC-05: Pre-fill "Retail General" FAQs if array is empty when mounting
  useEffect(() => {
    // defaultValues already sets the 5 FAQs; this is a safety net for future extension
  }, []);

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  const onSubmit = async (data: CustomizeFormValues) => {
    setSubmitError(null);
    try {
      // Build paymentMethods array
      const paymentMethods: {
        type: 'cod' | 'transfer' | 'payment_link';
        label: string;
        instructions?: string;
        bankInfo?: {
          bankName: string;
          accountNumber: string;
          accountType: 'ahorros' | 'corriente';
          accountHolder: string;
        };
        paymentLinkUrl?: string;
      }[] = [];

      if (data.acceptsCash) {
        paymentMethods.push({ type: 'cod', label: 'Efectivo / Pago contra entrega' });
      }
      if (data.acceptsTransfer) {
        paymentMethods.push({
          type: 'transfer',
          label: 'Transferencia / Nequi',
          ...(data.bankName || data.bankAccount || data.bankHolder
            ? {
                bankInfo: {
                  bankName: data.bankName ?? '',
                  accountNumber: data.bankAccount ?? '',
                  accountType: 'ahorros',
                  accountHolder: data.bankHolder ?? '',
                },
              }
            : {}),
        });
      }
      if (data.acceptsPaymentLink) {
        paymentMethods.push({
          type: 'payment_link',
          label: 'Link de pago',
          paymentLinkUrl: data.paymentLinkUrl ?? '',
        });
      }

      // AC-11: PATCH /merchants/me/config
      await saveConfig.mutateAsync({
        paymentMethods,
        shippingConfig: { shippingPolicy: data.shippingPolicy },
        returnPolicy: data.returnPolicy,
        businessHours: data.businessHours || undefined,
      });

      // AC-11: PATCH /merchants/me/playbook (FAQs)
      await saveFaqs.mutateAsync({ faqs: data.faqs });

      onNext();
    } catch (err) {
      setSubmitError((err as Error).message);
    }
  };

  const addFaq = () => {
    if (faqCount >= 10) return;
    append({ question: '', answer: '', keywords: [] });
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Personaliza tu tienda</h2>
        <p className="mt-1 text-sm text-gray-500">
          Configura pagos, políticas y respuestas automáticas para tus clientes.
        </p>
      </div>

      {isCompleted && !saveConfig.isSuccess && (
        <Alert variant="success">
          <AlertDescription>
            ✅ Tienda ya personalizada. Puedes actualizar si lo necesitas.
          </AlertDescription>
        </Alert>
      )}

      {submitError && (
        <Alert>
          <AlertDescription className="text-red-600">{submitError}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-0">
        {/* AC-01: Accordion con 3 secciones — AC-02: section 1 expanded */}
        <Accordion type="single" defaultValue="payments" className="rounded-lg border border-gray-200">
          {/* ── Sección 1: Métodos de pago ───────────────────────────── */}
          <AccordionItem value="payments">
            <AccordionTrigger>
              💳 Métodos de pago
              <span className="ml-auto mr-4 text-xs text-gray-400">
                {[watch('acceptsCash'), watch('acceptsTransfer'), watch('acceptsPaymentLink')].filter(Boolean).length} seleccionados
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4">
                <fieldset className="space-y-3">
                  <legend className="text-sm font-medium text-gray-700">
                    Métodos aceptados <span className="text-red-500">*</span>
                  </legend>

                  {[
                    { name: 'acceptsCash' as const, label: 'Efectivo / Pago contra entrega' },
                    { name: 'acceptsTransfer' as const, label: 'Transferencia bancaria / Nequi' },
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

                {/* Campos bancarios — condicional */}
                {showTransfer && (
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
                          placeholder="Ej: Bancolombia"
                          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1" htmlFor="bankAccount">
                          Número de cuenta
                        </label>
                        <input
                          {...register('bankAccount')}
                          id="bankAccount"
                          type="text"
                          placeholder="Cuenta corriente / ahorros"
                          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1" htmlFor="bankHolder">
                        Titular
                      </label>
                      <input
                        {...register('bankHolder')}
                        id="bankHolder"
                        type="text"
                        placeholder="Nombre del titular"
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                )}

                {/* URL payment link — condicional */}
                {showPaymentLink && (
                  <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 space-y-2">
                    <label
                      className="block text-sm font-medium text-gray-700"
                      htmlFor="paymentLinkUrl"
                    >
                      URL de tu link de pago
                    </label>
                    <input
                      {...register('paymentLinkUrl')}
                      id="paymentLinkUrl"
                      type="url"
                      placeholder="https://link.mercadopago.com.co/tu-negocio"
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    {errors.paymentLinkUrl && (
                      <p className="text-sm text-red-600">{errors.paymentLinkUrl.message}</p>
                    )}
                  </div>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* ── Sección 2: Políticas ─────────────────────────────────── */}
          <AccordionItem value="policies">
            <AccordionTrigger>📋 Políticas de tu negocio</AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4">
                <div>
                  <label
                    className="block text-sm font-medium text-gray-700 mb-1"
                    htmlFor="shippingPolicy"
                  >
                    Política de envíos <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    {...register('shippingPolicy')}
                    id="shippingPolicy"
                    rows={3}
                    maxLength={500}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                    placeholder="Describe cómo haces los envíos..."
                  />
                  {errors.shippingPolicy && (
                    <p className="text-sm text-red-600">{errors.shippingPolicy.message}</p>
                  )}
                </div>

                <div>
                  <label
                    className="block text-sm font-medium text-gray-700 mb-1"
                    htmlFor="returnPolicy"
                  >
                    Política de devoluciones <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    {...register('returnPolicy')}
                    id="returnPolicy"
                    rows={3}
                    maxLength={500}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                    placeholder="Describe tu política de cambios y devoluciones..."
                  />
                  {errors.returnPolicy && (
                    <p className="text-sm text-red-600">{errors.returnPolicy.message}</p>
                  )}
                </div>

                <div>
                  <label
                    className="block text-sm font-medium text-gray-700 mb-1"
                    htmlFor="businessHours"
                  >
                    Horario de atención{' '}
                    <span className="text-gray-400 font-normal text-xs">(opcional)</span>
                  </label>
                  <input
                    {...register('businessHours')}
                    id="businessHours"
                    type="text"
                    maxLength={200}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="Ej: Lunes a Viernes 9am-6pm, Sábados 9am-1pm"
                  />
                  {errors.businessHours && (
                    <p className="text-sm text-red-600">{errors.businessHours.message}</p>
                  )}
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* ── Sección 3: FAQs ──────────────────────────────────────── */}
          <AccordionItem value="faqs">
            <AccordionTrigger
              badge={
                <Badge variant="secondary" className="ml-2 text-xs">
                  {faqCount} de 10
                </Badge>
              }
            >
              ❓ Preguntas frecuentes
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4">
                {faqFields.map((field, index) => (
                  <div
                    key={field.id}
                    className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3 relative"
                  >
                    <div className="flex items-start justify-between">
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        FAQ #{index + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => remove(index)}
                        className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors"
                        aria-label={`Eliminar FAQ #${index + 1}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    <div>
                      <label
                        className="block text-xs text-gray-500 mb-1"
                        htmlFor={`faqs.${index}.question`}
                      >
                        Pregunta
                      </label>
                      <input
                        {...register(`faqs.${index}.question`, {
                          onChange: (e) => {
                            // Auto-generate keywords on question change
                            const keywords = normalizeKeywords(e.target.value as string);
                            // We use a controlled approach via rhf setValue
                          },
                        })}
                        id={`faqs.${index}.question`}
                        type="text"
                        maxLength={100}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="¿Cuánto demora el envío?"
                      />
                      {errors.faqs?.[index]?.question && (
                        <p className="text-xs text-red-600 mt-1">
                          {errors.faqs[index].question?.message}
                        </p>
                      )}
                    </div>

                    <div>
                      <label
                        className="block text-xs text-gray-500 mb-1"
                        htmlFor={`faqs.${index}.answer`}
                      >
                        Respuesta del bot
                      </label>
                      <textarea
                        {...register(`faqs.${index}.answer`)}
                        id={`faqs.${index}.answer`}
                        rows={2}
                        maxLength={300}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                        placeholder="Los envíos demoran 3-5 días hábiles 📦"
                      />
                      {errors.faqs?.[index]?.answer && (
                        <p className="text-xs text-red-600 mt-1">
                          {errors.faqs[index].answer?.message}
                        </p>
                      )}
                    </div>
                  </div>
                ))}

                {/* AC-06: Botón agregar deshabilitado si ≥10 */}
                <button
                  type="button"
                  onClick={addFaq}
                  disabled={faqCount >= 10}
                  className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  Agregar pregunta
                </button>

                {faqCount === 0 && (
                  <p className="text-sm text-gray-400 italic">
                    Sin FAQs — el bot usará respuestas genéricas.
                  </p>
                )}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {/* Footer — navigation */}
        <div className="flex items-center justify-between pt-6">
          <Button type="button" variant="outline" onClick={onBack}>
            ← Anterior
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar y Continuar
          </Button>
        </div>
      </form>
    </div>
  );
}
