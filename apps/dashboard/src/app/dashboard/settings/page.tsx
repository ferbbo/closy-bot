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
// import { RulesSection } from '@/components/settings/rules-section';
import { GuidelinesSection } from '@/components/settings/guidelines-section';
import {
  useMerchantProfile,
  usePatchPlaybookConfig,
  useUpdateMerchantName,
} from '@/hooks/use-playbook-config';
import type { MerchantProfileFormValues } from '@/lib/schemas/playbook-config.schema';
import type {
  PlaybookMessagesFormValues,
  PlaybookRulesFormValues,
  LlmPromptConfigFormValues,
} from '@/lib/schemas/playbook-config.schema';

// ── Sections config ───────────────────────────────────────────────────────

const SECTION_IDS = ['profile', 'messages', 'guidelines'] as const;
type SectionId = (typeof SECTION_IDS)[number];

const SECTION_LABELS: Record<SectionId, string> = {
  profile: '👤 Perfil',
  messages: '💬 Mensajes',
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

  // Backend ALWAYS returns non-null playbookConfig (hydrated in getProfile — PR-15.1)
  const playbook = profile.playbookConfig!;
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
