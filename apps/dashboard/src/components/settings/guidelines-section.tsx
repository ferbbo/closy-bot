'use client';

/**
 * PR-FE-05: Guidelines Section
 * REQ-05 / AC-06: LlmPromptConfig — tone textarea + array chip inputs + emoji selector
 */
import { useEffect, useState, useRef } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, X, Plus } from 'lucide-react';
import {
  llmPromptConfigSchema,
  type LlmPromptConfigFormValues,
} from '@/lib/schemas/playbook-config.schema';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import type { LlmPromptConfig } from '@/types/playbook';

// ── Chip / tag array input ─────────────────────────────────────────────────

interface ChipInputProps {
  label: string;
  hint?: string;
  value: string[];
  onChange: (v: string[]) => void;
  error?: string;
  placeholder?: string;
}

function ChipInput({ label, hint, value, onChange, error, placeholder }: ChipInputProps) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const add = () => {
    const trimmed = draft.trim();
    if (!trimmed || value.includes(trimmed)) return;
    onChange([...value, trimmed]);
    setDraft('');
    inputRef.current?.focus();
  };

  const remove = (item: string) => onChange(value.filter((v) => v !== item));

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {hint && <p className="text-xs text-gray-500">{hint}</p>}
      <div className="flex flex-wrap gap-2 min-h-[42px] p-2 border border-input rounded-md bg-transparent">
        {value.map((item) => (
          <span
            key={item}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-sm"
          >
            {item}
            <button
              type="button"
              onClick={() => remove(item)}
              className="hover:text-blue-600 focus:outline-none"
              aria-label={`Eliminar "${item}"`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <div className="flex items-center gap-1 flex-1 min-w-[120px]">
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
            placeholder={placeholder ?? 'Escribe y presiona Enter'}
            className="flex-1 text-sm bg-transparent outline-none placeholder:text-gray-400"
          />
          <button
            type="button"
            onClick={add}
            disabled={!draft.trim()}
            className="text-blue-600 hover:text-blue-800 disabled:opacity-30"
            aria-label="Agregar"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

// ── Emoji usage selector ──────────────────────────────────────────────────

const EMOJI_OPTIONS = [
  { value: 'none', label: 'Ninguno', description: 'Sin emojis' },
  { value: 'moderate', label: 'Moderado', description: 'Emojis ocasionales' },
  { value: 'frequent', label: 'Frecuente', description: 'Emojis abundantes' },
] as const;

// ── Component ─────────────────────────────────────────────────────────────

interface GuidelinesSectionProps {
  llmPrompt: LlmPromptConfig;
  onSave: (data: LlmPromptConfigFormValues) => void;
  isSaving: boolean;
}

export function GuidelinesSection({
  llmPrompt,
  onSave,
  isSaving,
}: GuidelinesSectionProps) {
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isDirty, isValid },
  } = useForm<LlmPromptConfigFormValues>({
    resolver: zodResolver(llmPromptConfigSchema),
    defaultValues: {
      tone: llmPrompt.tone,
      focusAreas: llmPrompt.focusAreas,
      commonQuestions: llmPrompt.commonQuestions,
      upsellStrategy: llmPrompt.upsellStrategy,
      emojiUsage: llmPrompt.emojiUsage,
    },
    mode: 'onChange',
  });

  useEffect(() => {
    reset({
      tone: llmPrompt.tone,
      focusAreas: llmPrompt.focusAreas,
      commonQuestions: llmPrompt.commonQuestions,
      upsellStrategy: llmPrompt.upsellStrategy,
      emojiUsage: llmPrompt.emojiUsage,
    });
  }, [llmPrompt, reset]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Directrices del bot (LLM)</CardTitle>
        <CardDescription>
          Configura el tono, áreas de enfoque y estrategia de upsell que guían las respuestas generadas por IA.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSave)} className="space-y-6">
          {/* Tone */}
          <div className="space-y-2">
            <Label htmlFor="llm-tone">Tono del bot</Label>
            <Textarea
              id="llm-tone"
              rows={4}
              placeholder="Ej: Amable, profesional y orientado a ayudar al cliente a encontrar el producto ideal..."
              {...register('tone')}
            />
            {errors.tone && (
              <p className="text-sm text-red-600">{errors.tone.message}</p>
            )}
          </div>

          {/* Focus areas — chips */}
          <Controller
            name="focusAreas"
            control={control}
            render={({ field }) => (
              <ChipInput
                label="Áreas de enfoque"
                hint="Aspectos clave que el bot pregunta al cliente (talla, color, tipo de piel, etc.)"
                value={field.value}
                onChange={field.onChange}
                error={errors.focusAreas?.message as string | undefined}
                placeholder="Ej: talla, color, ocasión"
              />
            )}
          />

          {/* Common questions — chips */}
          <Controller
            name="commonQuestions"
            control={control}
            render={({ field }) => (
              <ChipInput
                label="Preguntas frecuentes"
                hint="Temas comunes que los clientes preguntan. Guían las respuestas predefinidas del bot."
                value={field.value}
                onChange={field.onChange}
                error={errors.commonQuestions?.message as string | undefined}
                placeholder="Ej: envíos, devoluciones, garantía"
              />
            )}
          />

          {/* Upsell strategy */}
          <div className="space-y-2">
            <Label htmlFor="upsell-strategy">Estrategia de upsell</Label>
            <Textarea
              id="upsell-strategy"
              rows={3}
              placeholder="Ej: Sugerir accesorios complementarios cuando el cliente agrega ropa al carrito..."
              {...register('upsellStrategy')}
            />
            {errors.upsellStrategy && (
              <p className="text-sm text-red-600">{errors.upsellStrategy.message}</p>
            )}
          </div>

          {/* Emoji usage */}
          <div className="space-y-3">
            <Label>Uso de emojis</Label>
            <Controller
              name="emojiUsage"
              control={control}
              render={({ field }) => (
                <div className="flex flex-wrap gap-3">
                  {EMOJI_OPTIONS.map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex items-center gap-2 cursor-pointer px-4 py-2 rounded-lg border transition-colors ${
                        field.value === opt.value
                          ? 'border-blue-500 bg-blue-50 text-blue-800'
                          : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="radio"
                        className="sr-only"
                        value={opt.value}
                        checked={field.value === opt.value}
                        onChange={() => field.onChange(opt.value)}
                      />
                      <span className="font-medium text-sm">{opt.label}</span>
                      <span className="text-xs text-gray-500">{opt.description}</span>
                    </label>
                  ))}
                </div>
              )}
            />
            {errors.emojiUsage && (
              <p className="text-sm text-red-600">{errors.emojiUsage.message}</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2 border-t">
            <Button type="submit" disabled={!isDirty || !isValid || isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Guardando...
                </>
              ) : (
                'Guardar cambios'
              )}
            </Button>
            {isDirty && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (window.confirm('¿Descartar cambios sin guardar?')) {
                    reset();
                  }
                }}
                disabled={isSaving}
              >
                Cancelar
              </Button>
            )}
            {isDirty && (
              <Badge variant="outline" className="text-orange-600 border-orange-300">
                Sin guardar
              </Badge>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
