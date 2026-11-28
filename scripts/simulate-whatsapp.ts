/**
 * Simula un webhook entrante de WhatsApp firmado (S1.5-T4) contra la API local.
 *
 *   pnpm simulate:whatsapp "2 hamburguesas sencillas" --from +573000000101
 *   pnpm simulate:whatsapp --audio --from +573000000101            # usa el audio fixture del sandbox
 *   pnpm simulate:whatsapp "esta" --image --from +573000000101      # imagen fixture con caption
 *
 * Opciones: --api <url> (por defecto http://localhost:3000), --media-id <id>.
 * Firma con WHATSAPP_APP_SECRET (o el appSecret del sandbox). Nunca habla con Meta.
 */
import {
  inboundAudio,
  inboundImage,
  inboundText,
  signPayload,
  WebhookPayload,
} from '../apps/api/test/meta-sandbox/webhook-builders';
import { FIXTURE_AUDIO_ID, FIXTURE_IMAGE_ID } from '../apps/api/test/meta-sandbox/fake-graph-api';
import { SANDBOX_APP } from '../apps/api/test/meta-sandbox/sandbox-app';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const flags = new Set(process.argv.filter((a) => a === '--audio' || a === '--image'));
  const valued = new Set(['--from', '--api', '--media-id']);
  const text = process.argv
    .slice(2)
    .filter((a, i, all) => !a.startsWith('--') && !valued.has(all[i - 1] ?? ''))
    .join(' ');
  const from = arg('from') ?? SANDBOX_APP.customers[0];
  const api = arg('api') ?? 'http://localhost:3000';

  let payload: WebhookPayload;
  if (flags.has('--audio')) payload = inboundAudio(from, arg('media-id') ?? FIXTURE_AUDIO_ID);
  else if (flags.has('--image'))
    payload = inboundImage(from, arg('media-id') ?? FIXTURE_IMAGE_ID, text || undefined);
  else if (text) payload = inboundText(from, text);
  else
    throw new Error(
      'Usage: simulate-whatsapp "<texto>" --from <tel> [--audio|--image] [--api url]',
    );

  const raw = JSON.stringify(payload);
  const secret = process.env.WHATSAPP_APP_SECRET ?? SANDBOX_APP.appSecret;
  const res = await fetch(`${api}/webhooks/whatsapp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Hub-Signature-256': signPayload(raw, secret),
    },
    body: raw,
  });
  console.log(
    `→ ${res.status} ${res.statusText} (${flags.has('--audio') ? 'audio' : flags.has('--image') ? 'image' : 'text'})`,
  );
  if (!res.ok) process.exit(1);
}

main().catch((error: unknown) => {
  console.error('❌', (error as Error).message);
  process.exit(1);
});
