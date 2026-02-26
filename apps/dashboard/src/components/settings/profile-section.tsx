'use client';

/**
 * PR-FE-05: Profile Section
 * REQ-02 / AC-02: name (editable) + industry badge (read-only "Retail General")
 */
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import {
  merchantProfileSchema,
  type MerchantProfileFormValues,
} from '@/lib/schemas/playbook-config.schema';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import type { MerchantProfile } from '@/types/playbook';

interface ProfileSectionProps {
  profile: MerchantProfile;
  onSave: (data: MerchantProfileFormValues) => void;
  isSaving: boolean;
}

export function ProfileSection({ profile, onSave, isSaving }: ProfileSectionProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty, isValid },
  } = useForm<MerchantProfileFormValues>({
    resolver: zodResolver(merchantProfileSchema),
    defaultValues: { name: profile.name },
    mode: 'onChange',
  });

  // Re-sync when profile data refreshes after save
  useEffect(() => {
    reset({ name: profile.name });
  }, [profile.name, reset]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Perfil del negocio</CardTitle>
        <CardDescription>
          Información básica de tu cuenta de comerciante.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSave)} className="space-y-6">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="merchant-name">Nombre del negocio</Label>
            <Input
              id="merchant-name"
              placeholder="Ej: Mi Tienda Oficial"
              {...register('name')}
            />
            {errors.name && (
              <p className="text-sm text-red-600">{errors.name.message}</p>
            )}
          </div>

          {/* Industry — read-only in MVP */}
          <div className="space-y-2">
            <Label>Industria</Label>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-sm px-3 py-1">
                Retail General
              </Badge>
              <p className="text-sm text-gray-500">
                (read-only en MVP)
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2 border-t">
            <Button
              type="submit"
              disabled={!isDirty || !isValid || isSaving}
            >
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
                    reset({ name: profile.name });
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
