/**
 * Registra el catálogo de plantillas utility de WhatsApp (SPEC §4.6a, RN-31) en un WABA.
 *
 * Uso:
 *   tsx scripts/register-whatsapp-templates.ts            # --dry-run (por defecto): imprime los payloads
 *   tsx scripts/register-whatsapp-templates.ts --apply    # registra vía Graph API
 *
 * --apply exige variables de entorno:
 *   WABA_ID                         WhatsApp Business Account ID
 *   WHATSAPP_ACCESS_TOKEN           token del canal (system user) con whatsapp_business_management
 *   WHATSAPP_API_URL   (opcional)   por defecto https://graph.facebook.com (el Meta Sandbox lo sobreescribe)
 *   WHATSAPP_API_VERSION (opcional) por defecto v18.0
 *   TEMPLATE_LANGUAGE  (opcional)   por defecto 'es'
 *
 * Nunca corre en CI: con CI=true y --apply aborta.
 */
import {
  WHATSAPP_TEMPLATES,
  toGraphTemplatePayload,
} from '../apps/api/src/verticals/delivery/messaging/whatsapp-templates.catalog';

async function main(): Promise<number> {
  const apply = process.argv.includes('--apply');
  const language = process.env.TEMPLATE_LANGUAGE || 'es';
  const apiUrl = (process.env.WHATSAPP_API_URL || 'https://graph.facebook.com').replace(/\/$/, '');
  const apiVersion = process.env.WHATSAPP_API_VERSION || 'v18.0';
  const wabaId = process.env.WABA_ID || '{WABA_ID}';
  const payloads = WHATSAPP_TEMPLATES.map((t) => toGraphTemplatePayload(t, language));

  if (!apply) {
    console.log(
      `# DRY RUN — POST ${apiUrl}/${apiVersion}/${wabaId}/message_templates (${payloads.length} plantillas)`,
    );
    console.log(JSON.stringify(payloads, null, 2));
    return 0;
  }

  if (process.env.CI) {
    console.error('register-whatsapp-templates --apply no corre en CI.');
    return 1;
  }
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!process.env.WABA_ID || !token) {
    console.error('--apply requiere WABA_ID y WHATSAPP_ACCESS_TOKEN en el entorno.');
    return 1;
  }

  let failures = 0;
  for (const payload of payloads) {
    const res = await fetch(`${apiUrl}/${apiVersion}/${wabaId}/message_templates`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = (await res.text()).slice(0, 300);
    if (res.ok) {
      console.log(`OK   ${payload.name}: ${body}`);
    } else {
      failures += 1;
      console.error(`FAIL ${payload.name}: HTTP ${res.status} ${body}`);
    }
  }
  return failures === 0 ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    console.error((error as Error).message);
    process.exit(1);
  });
