'use client';

/**
 * PR-FE-05: Messages Section
 * REQ-03 / AC-03, AC-04: All PlaybookMessages fields, grouped in accordion categories
 * 30+ fields grouped in 5 categories with placeholder preview
 */
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import {
  playbookMessagesSchema,
  type PlaybookMessagesFormValues,
} from '@/lib/schemas/playbook-config.schema';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';
import type { PlaybookMessages } from '@/types/playbook';

// ── Field metadata ────────────────────────────────────────────────────────

interface FieldMeta {
  key: keyof PlaybookMessages;
  label: string;
  placeholders?: string[];
  hint?: string;
}

interface CategoryMeta {
  id: string;
  title: string;
  fields: FieldMeta[];
}

const MESSAGE_CATEGORIES: CategoryMeta[] = [
  {
    id: 'welcome',
    title: 'Bienvenida y Ayuda',
    fields: [
      {
        key: 'greeting',
        label: 'Saludo de bienvenida',
        placeholders: ['{merchant_name}'],
        hint: 'Primer mensaje que recibe el cliente al iniciar la conversación.',
      },
      { key: 'helpMenu', label: 'Menú de ayuda', hint: 'Opciones que se muestran cuando el cliente pide ayuda.' },
      { key: 'unknownIntent', label: 'Intención desconocida', hint: 'Respuesta cuando el bot no entiende al cliente.' },
      { key: 'genericError', label: 'Error genérico', placeholders: ['{action}'] },
      { key: 'productNotFound', label: 'Producto no encontrado', placeholders: ['{query}'] },
    ],
  },
  {
    id: 'cart',
    title: 'Carrito',
    fields: [
      { key: 'addToCartConfirm', label: 'Confirmación al agregar al carrito' },
      { key: 'noStock', label: 'Sin stock' },
      { key: 'cartEmpty', label: 'Carrito vacío' },
      { key: 'cartSummaryHeader', label: 'Encabezado del resumen del carrito', placeholders: ['{item_count}', '{item_word}'] },
      { key: 'cartSummaryFooter', label: 'Pie del resumen del carrito', placeholders: ['{total}'] },
      { key: 'removeConfirm', label: 'Confirmación al eliminar producto', placeholders: ['{product_name}', '{variant_name}'] },
      { key: 'updateConfirm', label: 'Confirmación al actualizar cantidad', placeholders: ['{product_name}', '{quantity}'] },
      { key: 'quantityInvalid', label: 'Cantidad inválida' },
      { key: 'itemNotInCart', label: 'Producto no está en el carrito', placeholders: ['{query}', '{items_list}'] },
      { key: 'cartEmptyNoAction', label: 'Carrito vacío (acción)', placeholders: ['{action}'] },
    ],
  },
  {
    id: 'search',
    title: 'Búsqueda y Catálogo',
    fields: [
      { key: 'searchNoResults', label: 'Sin resultados de búsqueda', placeholders: ['{query}'] },
      { key: 'searchResultsHeader', label: 'Encabezado de resultados', placeholders: ['{query}', '{count}'] },
      { key: 'searchResultsFooter', label: 'Pie de resultados' },
      { key: 'productMultipleOptions', label: 'Múltiples productos encontrados', placeholders: ['{product_list}'] },
      { key: 'variantMultipleOptions', label: 'Múltiples variantes encontradas', placeholders: ['{product_name}', '{variant_list}'] },
    ],
  },
  {
    id: 'checkout',
    title: 'Checkout y Upsell',
    fields: [
      { key: 'checkoutStart', label: 'Inicio del checkout' },
      { key: 'upsellTemplate', label: 'Sugerencia de upsell', placeholders: ['{product}'] },
    ],
  },
  {
    id: 'postsale',
    title: 'Post-venta',
    fields: [
      {
        key: 'orderStatusTemplate',
        label: 'Template de estado del pedido',
        placeholders: ['{orderCode}', '{statusMessage}'],
      },
      { key: 'orderStatusPendingPayment', label: 'Estado: Pago pendiente' },
      { key: 'orderStatusConfirmed', label: 'Estado: Confirmado' },
      { key: 'orderStatusPaid', label: 'Estado: Pagado' },
      { key: 'orderStatusShipped', label: 'Estado: Enviado', placeholders: ['{trackingInfo}'] },
      { key: 'orderStatusDelivered', label: 'Estado: Entregado' },
      { key: 'orderStatusCancelled', label: 'Estado: Cancelado' },
      { key: 'noOrderFound', label: 'Pedido no encontrado' },
      { key: 'ticketTypePrompt', label: 'Selección de tipo de ticket' },
      { key: 'ticketCreatedConfirm', label: 'Ticket creado', placeholders: ['{ticketId}'] },
      { key: 'ticketDescriptionPrompt', label: 'Solicitar descripción del ticket' },
    ],
  },
];

// ── Field component with placeholder preview (AC-04) ─────────────────────

interface MessageFieldProps {
  fieldMeta: FieldMeta;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: any;
  error?: string;
}

function MessageField({ fieldMeta, register, error }: MessageFieldProps) {
  const { key, label, placeholders, hint } = fieldMeta;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={`msg-${key}`} className="text-sm font-medium">
        {label}
      </Label>
      <Textarea
        id={`msg-${key}`}
        rows={2}
        className={error ? 'border-red-400 focus-visible:ring-red-400' : ''}
        {...register(key)}
      />
      {/* AC-04: Placeholder badges */}
      {placeholders && placeholders.length > 0 && (
        <p className="text-xs text-gray-500 flex items-center flex-wrap gap-1">
          <span>Placeholders disponibles:</span>
          {placeholders.map((ph) => (
            <Badge key={ph} variant="secondary" className="font-mono text-xs">
              {ph}
            </Badge>
          ))}
        </p>
      )}
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────

interface MessagesSectionProps {
  messages: PlaybookMessages;
  onSave: (data: PlaybookMessagesFormValues) => void;
  isSaving: boolean;
}

export function MessagesSection({ messages, onSave, isSaving }: MessagesSectionProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<PlaybookMessagesFormValues>({
    resolver: zodResolver(playbookMessagesSchema),
    defaultValues: messages,
  });

  useEffect(() => {
    reset(messages);
  }, [messages, reset]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mensajes del bot</CardTitle>
        <CardDescription>
          Personaliza los textos que el bot envía en cada etapa de la conversación.
          Los <span className="font-mono text-xs bg-gray-100 px-1 rounded">{'{placeholders}'}</span> se sustituyen automáticamente.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSave)} className="space-y-4">
          {/* Accordion groups — first category open by default */}
          <Accordion
            type="single"
            defaultValue={MESSAGE_CATEGORIES[0].id}
            className="border rounded-lg overflow-hidden"
          >
            {MESSAGE_CATEGORIES.map((category) => (
              <AccordionItem key={category.id} value={category.id}>
                <AccordionTrigger className="px-4 py-3 font-medium text-sm bg-gray-50 hover:bg-gray-100">
                  {category.title}
                  <span className="ml-auto mr-2 text-xs text-gray-400 font-normal">
                    {category.fields.length} campos
                  </span>
                </AccordionTrigger>
                <AccordionContent className="px-4 py-4">
                  <div className="space-y-4">
                    {category.fields.map((field) => (
                      <MessageField
                        key={field.key}
                        fieldMeta={field}
                        register={register}
                        error={(errors[field.key] as { message?: string } | undefined)?.message}
                      />
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2 border-t">
            <Button type="submit" disabled={!isDirty || isSaving}>
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
                onClick={() => reset(messages)}
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
