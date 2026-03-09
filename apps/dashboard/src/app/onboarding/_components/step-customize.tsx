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

import { useState } from 'react';
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
// Placeholders de políticas (Retail General)
// ---------------------------------------------------------------------------

const PLACEHOLDER_SHIPPING_POLICY =
  'Ej: Envíos a toda Colombia. Tiempo: 3-5 días hábiles. Costo según ciudad.';
const PLACEHOLDER_RETURN_POLICY =
  'Ej: Aceptamos cambios dentro de 8 días. Producto sin uso y con etiquetas.';

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

// Bancos Colombia
const COLOMBIA_BANKS = [
  { id: 'banco_bogota', name: 'Banco de Bogotá' },
  { id: 'banco_popular', name: 'Banco Popular' },
  { id: 'bancolombia', name: 'Bancolombia' },
  { id: 'bbva', name: 'BBVA Colombia' },
  { id: 'davivienda', name: 'Davivienda' },
  { id: 'banco_occidente', name: 'Banco de Occidente' },
  { id: 'av_villas', name: 'Banco AV Villas' },
  { id: 'banco_caja_social', name: 'Banco Caja Social' },
  { id: 'banco_agrario', name: 'Banco Agrario de Colombia' },
  { id: 'scotiabank_colpatria', name: 'Scotiabank Colpatria' },
  { id: 'banco_pichincha', name: 'Banco Pichincha' },
  { id: 'gnb_sudameris', name: 'Banco GNB Sudameris' },
  { id: 'citibank', name: 'Citibank Colombia' },
  { id: 'banco_w', name: 'Banco W' },
  { id: 'banco_finandina', name: 'Banco Finandina' },
  { id: 'banco_serfinanza', name: 'Banco Serfinanza' },
  { id: 'banco_coopcentral', name: 'Banco Cooperativo Coopcentral' },
  { id: 'nu', name: 'Nu Bank' },
  { id: 'lulo_bank', name: 'Lulo Bank' },
  { id: 'uala', name: 'Ualá' },
] as const;

// Indicativos telefónicos comunes LATAM
const COUNTRY_CODES = [
  { code: '+57', label: '🇨🇴 +57' },
  { code: '+58', label: '🇻🇪 +58' },
  { code: '+51', label: '🇵🇪 +51' },
  { code: '+52', label: '🇲🇽 +52' },
  { code: '+54', label: '🇦🇷 +54' },
  { code: '+56', label: '🇨🇱 +56' },
  { code: '+593', label: '🇪🇨 +593' },
  { code: '+1', label: '🇺🇸 +1' },
] as const;

const customizeSchema = z
  .object({
    // Payment methods
    acceptsCash: z.boolean(),
    acceptsTransfer: z.boolean(),
    acceptsPaymentLink: z.boolean(),
    // Bank transfer sub-type selector
    transferSubtype: z.enum(['bank', 'nequi']),
    // Bank fields
    bankName: z.string(),
    bankAccount: z.string(),
    bankAccountType: z.enum(['ahorros', 'corriente']),
    bankHolder: z.string(),
    bankHolderDni: z.string(),
    // Nequi fields
    nequiCountryCode: z.string(),
    nequiPhone: z.string(),
    // Payment link
    paymentLinkUrl: z.string().optional(),
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
  })
  // Validaciones banco
  .refine((d) => !(d.acceptsTransfer && d.transferSubtype === 'bank') || d.bankName.trim().length > 0, {
    message: 'El banco es requerido.',
    path: ['bankName'],
  })
  .refine((d) => !(d.acceptsTransfer && d.transferSubtype === 'bank') || d.bankAccount.trim().length > 0, {
    message: 'El número de cuenta es requerido.',
    path: ['bankAccount'],
  })
  .refine((d) => !(d.acceptsTransfer && d.transferSubtype === 'bank') || d.bankHolder.trim().length > 0, {
    message: 'El titular es requerido.',
    path: ['bankHolder'],
  })
  .refine((d) => !(d.acceptsTransfer && d.transferSubtype === 'bank') || d.bankHolderDni.trim().length > 0, {
    message: 'La cédula del titular es requerida.',
    path: ['bankHolderDni'],
  })
  // Validaciones Nequi
  .refine(
    (d) => !(d.acceptsTransfer && d.transferSubtype === 'nequi') || d.nequiCountryCode.trim().length > 0,
    { message: 'El indicativo es requerido.', path: ['nequiCountryCode'] },
  )
  .refine(
    (d) => !(d.acceptsTransfer && d.transferSubtype === 'nequi') || /^\d{7,15}$/.test(d.nequiPhone),
    { message: 'Número inválido (7-15 dígitos sin espacios ni guiones).', path: ['nequiPhone'] },
  )
  // Validaciones link de pago
  .refine(
    (d) => !d.acceptsPaymentLink || (!!d.paymentLinkUrl && d.paymentLinkUrl.trim().length > 0),
    { message: 'La URL del link de pago es requerida.', path: ['paymentLinkUrl'] },
  )
  .refine(
    (d) => !d.paymentLinkUrl || /^https?:\/\/.+/.test(d.paymentLinkUrl),
    { message: 'URL inválida', path: ['paymentLinkUrl'] },
  );

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
    setValue,
    formState: { errors, isSubmitting, isValid },
  } = useForm<CustomizeFormValues>({
    resolver: zodResolver(customizeSchema),
    mode: 'onChange',
    defaultValues: {
      acceptsCash: true,
      acceptsTransfer: true,
      acceptsPaymentLink: false,
      transferSubtype: 'bank',
      bankName: '',
      bankAccount: '',
      bankAccountType: 'ahorros',
      bankHolder: '',
      bankHolderDni: '',
      nequiCountryCode: '+57',
      nequiPhone: '',
      paymentLinkUrl: '',
      shippingPolicy: '',
      returnPolicy: '',
      businessHours: '',
      faqs: [],
    },
  });

  const { fields: faqFields, append, remove } = useFieldArray({ control, name: 'faqs' });

  const showTransfer = watch('acceptsTransfer');
  const showPaymentLink = watch('acceptsPaymentLink');
  const transferSubtype = watch('transferSubtype');
  const faqCount = faqFields.length;

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
        if (data.transferSubtype === 'bank') {
          paymentMethods.push({
            type: 'transfer',
            label: 'Transferencia bancaria',
            bankInfo: {
              bankName: data.bankName ?? '',
              accountNumber: data.bankAccount ?? '',
              accountType: data.bankAccountType ?? 'ahorros',
              accountHolder: data.bankHolder ?? '',
            },
          });
        } else {
          paymentMethods.push({
            type: 'transfer',
            label: 'Nequi',
            instructions: `${data.nequiCountryCode} ${data.nequiPhone}`,
          });
        }
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

                  {errors.acceptsCash?.message &&
                    !watch('acceptsCash') &&
                    !watch('acceptsTransfer') &&
                    !watch('acceptsPaymentLink') && (
                    <p className="text-sm text-red-600">{errors.acceptsCash.message}</p>
                  )}
                </fieldset>

                {/* Subtipo transferencia — condicional */}
                {showTransfer && (
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-4">
                    {/* Radio: banco vs Nequi */}
                    <fieldset className="space-y-2">
                      <legend className="text-sm font-medium text-gray-700">
                        Tipo de transferencia <span className="text-red-500">*</span>
                      </legend>
                      <div className="flex gap-6">
                        {(['bank', 'nequi'] as const).map((sub) => (
                          <label key={sub} className="flex items-center gap-2 cursor-pointer">
                            <input
                              {...register('transferSubtype')}
                              type="radio"
                              value={sub}
                              className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-600"
                            />
                            <span className="text-sm text-gray-700">
                              {sub === 'bank' ? '🏦 Datos bancarios' : '📱 Nequi'}
                            </span>
                          </label>
                        ))}
                      </div>
                    </fieldset>

                    {/* ── Datos bancarios ── */}
                    {transferSubtype === 'bank' && (
                      <div className="space-y-3">
                        {/* Tipo de cuenta */}
                        <fieldset className="space-y-2">
                          <legend className="text-xs text-gray-500">Tipo de cuenta</legend>
                          <div className="flex gap-6">
                            {(['ahorros', 'corriente'] as const).map((tipo) => (
                              <label key={tipo} className="flex items-center gap-2 cursor-pointer">
                                <input
                                  {...register('bankAccountType')}
                                  type="radio"
                                  value={tipo}
                                  className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-600"
                                />
                                <span className="text-sm text-gray-700 capitalize">{tipo}</span>
                              </label>
                            ))}
                          </div>
                        </fieldset>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1" htmlFor="bankName">
                              Banco <span className="text-red-500">*</span>
                            </label>
                            <select
                              {...register('bankName')}
                              id="bankName"
                              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                            >
                              <option value="">Selecciona un banco...</option>
                              {COLOMBIA_BANKS.map(({ id, name }) => (
                                <option key={id} value={id}>{name}</option>
                              ))}
                            </select>
                            {errors.bankName && (
                              <p className="text-xs text-red-600 mt-1">{errors.bankName.message}</p>
                            )}
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1" htmlFor="bankAccount">
                              Número de cuenta <span className="text-red-500">*</span>
                            </label>
                            <input
                              {...register('bankAccount')}
                              id="bankAccount"
                              type="text"
                              placeholder="Ej: 123456789"
                              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                            {errors.bankAccount && (
                              <p className="text-xs text-red-600 mt-1">{errors.bankAccount.message}</p>
                            )}
                          </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <label className="block text-xs text-gray-500 mb-1" htmlFor="bankHolder">
                              Titular <span className="text-red-500">*</span>
                            </label>
                            <input
                              {...register('bankHolder')}
                              id="bankHolder"
                              type="text"
                              placeholder="Nombre completo"
                              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                            {errors.bankHolder && (
                              <p className="text-xs text-red-600 mt-1">{errors.bankHolder.message}</p>
                            )}
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-1" htmlFor="bankHolderDni">
                              Cédula del titular <span className="text-red-500">*</span>
                            </label>
                            <input
                              {...register('bankHolderDni')}
                              id="bankHolderDni"
                              type="text"
                              placeholder="Ej: 1234567890"
                              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                            {errors.bankHolderDni && (
                              <p className="text-xs text-red-600 mt-1">{errors.bankHolderDni.message}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ── Nequi ── */}
                    {transferSubtype === 'nequi' && (
                      <div className="space-y-2">
                        <p className="text-xs text-gray-500">
                          Número de Nequi <span className="text-red-500">*</span>
                        </p>
                        <div className="flex gap-2">
                          <div className="w-32 shrink-0">
                            <select
                              {...register('nequiCountryCode')}
                              className="w-full rounded-md border border-gray-300 px-2 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                            >
                              {COUNTRY_CODES.map(({ code, label }) => (
                                <option key={code} value={code}>{label}</option>
                              ))}
                            </select>
                          </div>
                          <div className="flex-1">
                            <input
                              {...register('nequiPhone')}
                              id="nequiPhone"
                              type="tel"
                              placeholder="3001234567"
                              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          </div>
                        </div>
                        {(errors.nequiCountryCode || errors.nequiPhone) && (
                          <p className="text-xs text-red-600">
                            {errors.nequiPhone?.message ?? errors.nequiCountryCode?.message}
                          </p>
                        )}
                      </div>
                    )}
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
                    placeholder={PLACEHOLDER_SHIPPING_POLICY}
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
                    placeholder={PLACEHOLDER_RETURN_POLICY}
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
                            // AC-11: Auto-generate keywords from question text (normalize: lowercase, sin tildes)
                            const keywords = normalizeKeywords(e.target.value as string);
                            void setValue(`faqs.${index}.keywords`, keywords, { shouldValidate: false });
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
          <Button type="submit" disabled={isSubmitting || !isValid}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar y Continuar
          </Button>
        </div>
      </form>
    </div>
  );
}
