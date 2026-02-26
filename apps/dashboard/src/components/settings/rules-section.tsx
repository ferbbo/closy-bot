'use client';

/**
 * PR-FE-05: Rules Section
 * REQ-04 / AC-05: 4 toggles + 1 input numérico (maxRecommendations)
 */
import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import {
  playbookRulesSchema,
  type PlaybookRulesFormValues,
} from '@/lib/schemas/playbook-config.schema';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import type { PlaybookRules } from '@/types/playbook';

const RULE_LABELS: Record<keyof Omit<PlaybookRules, 'maxRecommendations'>, { label: string; description: string }> = {
  askSizeBeforeCart: {
    label: 'Preguntar talla antes de agregar al carrito',
    description: 'Aplica para tiendas de ropa. El bot pedirá la talla antes de agregar el producto.',
  },
  askSkinTypeOnSearch: {
    label: 'Preguntar tipo de piel en búsquedas',
    description: 'Aplica para tiendas de belleza. Filtra resultados según tipo de piel.',
  },
  autoSubstitutions: {
    label: 'Sustituciones automáticas (sin stock)',
    description: 'Aplica para minimarkets. El bot sugerirá alternativas cuando un producto no tenga stock.',
  },
  upsellEnabled: {
    label: 'Habilitar sugerencias de upsell',
    description: 'El bot sugerirá productos adicionales o complementarios durante el proceso de venta.',
  },
};

interface RulesSectionProps {
  rules: PlaybookRules;
  onSave: (data: PlaybookRulesFormValues) => void;
  isSaving: boolean;
}

export function RulesSection({ rules, onSave, isSaving }: RulesSectionProps) {
  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty, isValid },
  } = useForm<PlaybookRulesFormValues>({
    resolver: zodResolver(playbookRulesSchema),
    defaultValues: {
      askSizeBeforeCart: rules.askSizeBeforeCart,
      askSkinTypeOnSearch: rules.askSkinTypeOnSearch,
      autoSubstitutions: rules.autoSubstitutions,
      upsellEnabled: rules.upsellEnabled,
      maxRecommendations: rules.maxRecommendations,
    },
    mode: 'onChange',
  });

  useEffect(() => {
    reset({
      askSizeBeforeCart: rules.askSizeBeforeCart,
      askSkinTypeOnSearch: rules.askSkinTypeOnSearch,
      autoSubstitutions: rules.autoSubstitutions,
      upsellEnabled: rules.upsellEnabled,
      maxRecommendations: rules.maxRecommendations,
    });
  }, [rules, reset]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reglas del bot</CardTitle>
        <CardDescription>
          Comportamientos automáticos que el bot aplica durante las conversaciones.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSave)} className="space-y-6">
          {/* Toggle switches */}
          <div className="space-y-4">
            {(Object.keys(RULE_LABELS) as Array<keyof typeof RULE_LABELS>).map((key) => (
              <div key={key} className="flex items-start justify-between gap-4 p-4 rounded-lg border border-gray-100 bg-gray-50/50">
                <div className="space-y-0.5 flex-1">
                  <Label className="font-medium">{RULE_LABELS[key].label}</Label>
                  <p className="text-sm text-gray-500">{RULE_LABELS[key].description}</p>
                </div>
                <Controller
                  name={key}
                  control={control}
                  render={({ field }) => (
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      aria-label={RULE_LABELS[key].label}
                    />
                  )}
                />
              </div>
            ))}
          </div>

          {/* maxRecommendations */}
          <div className="space-y-2">
            <Label htmlFor="maxRecommendations">
              Máximo de recomendaciones por búsqueda
            </Label>
            <div className="flex items-center gap-3">
              <Input
                id="maxRecommendations"
                type="number"
                min={1}
                max={10}
                className="w-24"
                {...register('maxRecommendations', { valueAsNumber: true })}
              />
              <p className="text-sm text-gray-500">productos (1–10)</p>
            </div>
            {errors.maxRecommendations && (
              <p className="text-sm text-red-600">{errors.maxRecommendations.message}</p>
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
                    reset({
                      askSizeBeforeCart: rules.askSizeBeforeCart,
                      askSkinTypeOnSearch: rules.askSkinTypeOnSearch,
                      autoSubstitutions: rules.autoSubstitutions,
                      upsellEnabled: rules.upsellEnabled,
                      maxRecommendations: rules.maxRecommendations,
                    });
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
