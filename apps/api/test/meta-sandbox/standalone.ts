/**
 * Meta Sandbox standalone (S1.5-T4) — Graph API falso para la demo local.
 *
 *   pnpm meta:sandbox            # escucha en http://127.0.0.1:4010 (META_SANDBOX_PORT para cambiarlo)
 *
 * Luego arranca la API con las variables impresas (WHATSAPP_API_URL apunta aquí) y envía
 * mensajes con `pnpm simulate:whatsapp "<texto>" --from +573000000101`.
 */
import { FakeGraphApi } from './fake-graph-api';
import { sandboxEnv } from './env';

async function main(): Promise<void> {
  const port = Number(process.env.META_SANDBOX_PORT ?? 4010);
  const graph = new FakeGraphApi({ port });
  const { baseUrl } = await graph.start();
  console.log(`🧪 Meta Sandbox listening on ${baseUrl}`);
  console.log('   Export these in the API shell (fake values, not real credentials):');
  for (const [key, value] of Object.entries(sandboxEnv(baseUrl))) {
    console.log(`   export ${key}=${value}`);
  }
  console.log(`   Inspect: curl ${baseUrl}/__sandbox/sent · ${baseUrl}/__sandbox/templates`);

  const shutdown = (): void => {
    void graph.stop().then(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error: unknown) => {
  console.error('❌ Meta Sandbox failed to start:', (error as Error).message);
  process.exit(1);
});
