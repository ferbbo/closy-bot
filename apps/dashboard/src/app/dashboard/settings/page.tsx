'use client';

/**
 * PR-FE-05: /dashboard/settings — Main settings page
 * AC-01: 4 tabs/sections: Profile, Messages, Rules, Guidelines
 * AC-07: Loads config via GET /merchants/me on mount
 */
import { useEffect, useRef } from 'react';
import { AlertCircle } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';
import { ProfileSection } from '@/components/settings/profile-section';
import { MessagesSection } from '@/components/settings/messages-section';
import { RulesSection } from '@/components/settings/rules-section';
import { GuidelinesSection } from '@/components/settings/guidelines-section';
import {
  useMerchantProfile,
  usePatchPlaybookConfig,
  useUpdateMerchantName,
} from '@/hooks/use-playbook-config';
import type {
  PlaybookConfig,
  PlaybookMessages,
  PlaybookRules,
  LlmPromptConfig,
} from '@/types/playbook';
import type { MerchantProfileFormValues } from '@/lib/schemas/playbook-config.schema';
import type {
  PlaybookMessagesFormValues,
  PlaybookRulesFormValues,
  LlmPromptConfigFormValues,
} from '@/lib/schemas/playbook-config.schema';

// ── Default fallback for null PlaybookConfig (AC edge-case: merchant nuevo) ─

const DEFAULT_MESSAGES: PlaybookMessages = {
  greeting: '¡Hola! Soy {merchant_name}, tu asistente virtual. ¿En qué te puedo ayudar?',
  addToCartConfirm: '✅ Agregué el producto a tu carrito.',
  noStock: 'Lo sentimos, ese producto no tiene stock disponible.',
  upsellTemplate: '¿Te interesa también {product}?',
  checkoutStart: 'Perfecto, vamos a completar tu pedido. 🛒',
  searchNoResults: 'No encontré resultados para "{query}". ¿Quieres buscar algo diferente?',
  searchResultsHeader: 'Encontré {count} resultado(s) para "{query}":',
  searchResultsFooter: '¿Cuál de estos te interesa?',
  helpMenu: 'Puedo ayudarte con:\n1. 🔍 Buscar productos\n2. 🛒 Ver mi carrito\n3. 📦 Estado de mi pedido\n4. 🧑‍💼 Hablar con un asesor',
  cartEmpty: 'Tu carrito está vacío. ¿Te ayudo a buscar algo?',
  cartSummaryHeader: 'Tu carrito tiene {item_count} {item_word}:',
  cartSummaryFooter: 'Total: {total}',
  removeConfirm: 'Eliminé {product_name} ({variant_name}) de tu carrito.',
  updateConfirm: 'Actualicé {product_name} a {quantity} unidad(es).',
  quantityInvalid: 'Cantidad inválida. Por favor ingresa un número entre 1 y 99.',
  productNotFound: 'No encontré "{query}" en nuestro catálogo.',
  productMultipleOptions: 'Encontré varios productos:\n{product_list}',
  variantMultipleOptions: '{product_name} tiene varias opciones:\n{variant_list}',
  itemNotInCart: 'No encontré "{query}" en tu carrito. Tienes:\n{items_list}',
  cartEmptyNoAction: 'Tu carrito está vacío. No puedo {action} sin productos.',
  genericError: 'Ocurrió un error al {action}. Por favor intenta de nuevo.',
  unknownIntent: 'No entendí bien. ¿Puedes decirme en qué te ayudo? Usa el menú de ayuda.',
  orderStatusTemplate: 'Tu pedido #{orderCode}: {statusMessage}',
  orderStatusPendingPayment: 'está pendiente de pago 💳',
  orderStatusConfirmed: 'fue confirmado ✅',
  orderStatusPaid: 'fue pagado exitosamente ✅',
  orderStatusShipped: 'está en camino 🚚 ({trackingInfo})',
  orderStatusDelivered: 'fue entregado 🎉',
  orderStatusCancelled: 'fue cancelado ❌',
  noOrderFound: 'No encontré ningún pedido activo asociado a tu cuenta.',
  ticketTypePrompt: '¿Cuál es el motivo de tu solicitud?\n1. 📦 Producto faltante\n2. ❌ Producto dañado\n3. ⏰ Demora en entrega',
  ticketCreatedConfirm: 'Creé tu ticket #{ticketId}. Un asesor te contactará pronto.',
  ticketDescriptionPrompt: 'Por favor descríbenos el problema con más detalle.',
};

const DEFAULT_RULES: PlaybookRules = {
  askSizeBeforeCart: false,
  askSkinTypeOnSearch: false,
  autoSubstitutions: false,
  upsellEnabled: false,
  maxRecommendations: 3,
};

const DEFAULT_LLM_PROMPT: LlmPromptConfig = {
  tone: 'Amable, profesional y orientado a ayudar al cliente a encontrar el producto ideal. Responde de forma concisa y clara.',
  focusAreas: ['talla', 'color', 'precio'],
  commonQuestions: ['envíos', 'devoluciones', 'métodos de pago'],
  upsellStrategy: 'Sugerir productos complementarios o de mayor valor cuando el cliente muestre interés.',
  emojiUsage: 'moderate',
};

function getPlaybookOrDefaults(config: PlaybookConfig | null | undefined): PlaybookConfig {
  if (!config) {
    return {
      industry: 'minimarket',
      messages: DEFAULT_MESSAGES,
      rules: DEFAULT_RULES,
      llmPrompt: DEFAULT_LLM_PROMPT,
      checkoutQuestions: [],
    };
  }
  return {
    ...config,
    messages: config.messages ?? DEFAULT_MESSAGES,
    rules: config.rules ?? DEFAULT_RULES,
    llmPrompt: config.llmPrompt ?? DEFAULT_LLM_PROMPT,
  };
}

// ── Sections config ───────────────────────────────────────────────────────

const SECTION_IDS = ['profile', 'messages', 'rules', 'guidelines'] as const;
type SectionId = (typeof SECTION_IDS)[number];

const SECTION_LABELS: Record<SectionId, string> = {
  profile: '👤 Perfil',
  messages: '💬 Mensajes',
  rules: '⚙️ Reglas',
  guidelines: '🤖 Directrices',
};

// ── Page ──────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { data: profile, isLoading, error } = useMerchantProfile();
  const patchMutation = usePatchPlaybookConfig();
  const nameMutation = useUpdateMerchantName();

  // Track if any section has dirty state (for beforeunload AC edge-case)
  const hasDirtyRef = useRef(false);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasDirtyRef.current) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  if (isLoading) return null; // loading.tsx handles skeleton

  if (error) {
    throw error; // error.tsx handles this
  }

  if (!profile) return null;

  const playbook = getPlaybookOrDefaults(profile.playbookConfig);
  const isSavingPlaybook = patchMutation.isPending;
  const isSavingProfile = nameMutation.isPending;

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleSaveProfile = (data: MerchantProfileFormValues) => {
    nameMutation.mutate({ name: data.name });
  };

  const handleSaveMessages = (data: PlaybookMessagesFormValues) => {
    patchMutation.mutate({ messages: data });
  };

  const handleSaveRules = (data: PlaybookRulesFormValues) => {
    patchMutation.mutate({ rules: data });
  };

  const handleSaveGuidelines = (data: LlmPromptConfigFormValues) => {
    patchMutation.mutate({ llmPrompt: data });
  };

  // ── Shared section content ───────────────────────────────────────────────

  function renderSection(sectionId: SectionId) {
    switch (sectionId) {
      case 'profile':
        return (
          <ProfileSection
            profile={profile!}
            onSave={handleSaveProfile}
            isSaving={isSavingProfile}
          />
        );
      case 'messages':
        return (
          <MessagesSection
            messages={playbook.messages}
            onSave={handleSaveMessages}
            isSaving={isSavingPlaybook}
          />
        );
      case 'rules':
        return (
          <RulesSection
            rules={playbook.rules}
            onSave={handleSaveRules}
            isSaving={isSavingPlaybook}
          />
        );
      case 'guidelines':
        return (
          <GuidelinesSection
            llmPrompt={playbook.llmPrompt}
            onSave={handleSaveGuidelines}
            isSaving={isSavingPlaybook}
          />
        );
    }
  }

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Configuración del bot</h1>
        <p className="text-gray-500 text-sm mt-1">
          Personaliza mensajes, reglas y directrices de tu asistente virtual.
        </p>
      </div>

      {/* New merchant prompt */}
      {!profile.playbookConfig && (
        <div className="mb-6 flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Configura tu bot</p>
            <p className="text-blue-700">
              Tu bot tiene una configuración por defecto. Personalízala para que refleje el tono y los mensajes de tu negocio.
            </p>
          </div>
        </div>
      )}

      {/* ── Desktop: Horizontal Tabs (md+) ── */}
      <div className="hidden md:block">
        <Tabs defaultValue="profile">
          <TabsList className="mb-6">
            {SECTION_IDS.map((id) => (
              <TabsTrigger key={id} value={id}>
                {SECTION_LABELS[id]}
              </TabsTrigger>
            ))}
          </TabsList>

          {SECTION_IDS.map((id) => (
            <TabsContent key={id} value={id}>
              {renderSection(id)}
            </TabsContent>
          ))}
        </Tabs>
      </div>

      {/* ── Mobile: Accordion (< md) ── */}
      <div className="md:hidden">
        <Accordion type="single" defaultValue="profile" className="space-y-3">
          {SECTION_IDS.map((id) => (
            <AccordionItem
              key={id}
              value={id}
              className="border border-gray-200 rounded-xl overflow-hidden bg-white"
            >
              <AccordionTrigger className="px-4 py-3 font-medium text-sm">
                {SECTION_LABELS[id]}
              </AccordionTrigger>
              <AccordionContent className="px-0 pb-0">
                {renderSection(id)}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </div>
  );
}
