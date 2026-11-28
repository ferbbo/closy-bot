import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../persistence/prisma/prisma.service';
import { PlaybookService } from '../../../../services/playbook.service';
import type { Industry } from '../../../../domain/entities/playbook-config.interface';
import { DeliveryConfigService } from '../../config/delivery-config.service';
import {
  BusinessInfo,
  BusinessTopic,
  DeliveryConfig,
  DeliveryTurnContext,
  LlmToolDef,
  ToolHandler,
  ToolResult,
} from '../../contracts';

const TOPICS: BusinessTopic[] = ['faq', 'politicas', 'horario', 'zonas', 'pagos', 'todo'];

/** Claves de `BusinessInfo` que devuelve cada tema (además de `merchantName`). */
const TOPIC_KEYS: Record<Exclude<BusinessTopic, 'todo'>, Array<keyof BusinessInfo>> = {
  faq: ['faqs'],
  politicas: ['policies'],
  horario: ['hours'],
  zonas: ['zones', 'pickupEnabled'],
  pagos: ['payments'],
};

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Instrucciones de un medio de pago, LITERALES de `MerchantConfig.paymentMethods`:
 * `instructions`; si no hay, los campos de `bankInfo` unidos con " · "; si no, `paymentLinkUrl`.
 */
function paymentInstructions(pm: Record<string, unknown>): string | null {
  const direct = str(pm.instructions);
  if (direct) return direct;
  const bank = asRecord(pm.bankInfo);
  if (bank) {
    const parts = ['bankName', 'accountType', 'accountNumber', 'accountHolder']
      .map((k) => str(bank[k]))
      .filter((v): v is string => v !== null);
    if (parts.length > 0) return parts.join(' · ');
  }
  return str(pm.paymentLinkUrl);
}

/**
 * Herramienta `consultar_negocio({tema?})` → `BusinessInfo` (RN-00, AC-42).
 * Lee en el turno `Merchant` + `MerchantConfig`; lo que no está en la BD va como `null`
 * explícito para que el agente diga "no tengo ese dato". Nunca usa defaults de código:
 * las FAQ genéricas del playbook legacy NO se devuelven (solo `playbookConfig.faqs` del comercio).
 */
@Injectable()
export class BusinessInfoTool {
  private readonly logger = new Logger(BusinessInfoTool.name);

  readonly definitions: LlmToolDef[] = [
    {
      name: 'consultar_negocio',
      description:
        'Datos del negocio desde la BD: preguntas frecuentes, políticas, horario y si está abierto, zonas con tarifa y mínimo, medios de pago. Un null significa que el dato no existe: no lo inventes.',
      parameters: {
        type: 'object',
        properties: {
          tema: {
            type: 'string',
            enum: TOPICS,
            description: 'Tema a consultar; "todo" por defecto',
          },
        },
        additionalProperties: false,
      },
    },
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly playbookService: PlaybookService,
    private readonly deliveryConfigService: DeliveryConfigService,
  ) {}

  handlers(): Record<string, ToolHandler> {
    return { consultar_negocio: (args, ctx) => this.consultar(args, ctx) };
  }

  private async consultar(
    args: Record<string, unknown>,
    ctx: DeliveryTurnContext,
  ): Promise<ToolResult> {
    const tema = (args.tema ?? 'todo') as BusinessTopic;
    if (!TOPICS.includes(tema)) return { ok: false, error: 'TEMA_INVALIDO' };
    try {
      const info = await this.load(ctx);
      if (!info) return { ok: false, error: 'COMERCIO_NO_ENCONTRADO' };
      if (tema === 'todo') return { ok: true, data: info };
      const data: Partial<BusinessInfo> = { merchantName: info.merchantName };
      for (const key of TOPIC_KEYS[tema]) Object.assign(data, { [key]: info[key] });
      return { ok: true, data };
    } catch (error) {
      this.logger.error(`consultar_negocio failed: ${(error as Error).message}`);
      return { ok: false, error: 'ERROR_NEGOCIO' };
    }
  }

  /** Lectura completa en el turno (sin caché). */
  async load(ctx: DeliveryTurnContext): Promise<BusinessInfo | null> {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: ctx.merchantId },
      select: {
        id: true,
        name: true,
        industry: true,
        playbookConfig: true,
        merchantConfig: {
          select: {
            paymentMethods: true,
            shippingConfig: true,
            returnPolicy: true,
            deliveryConfig: true,
          },
        },
      },
    });
    if (!merchant) return null;
    const mc = merchant.merchantConfig;
    const hasDeliveryConfig = mc?.deliveryConfig !== null && mc?.deliveryConfig !== undefined;
    const cfg: DeliveryConfig | null = hasDeliveryConfig
      ? this.deliveryConfigService.parseStored(merchant.id, mc.deliveryConfig)
      : null;

    return {
      merchantName: merchant.name,
      faqs: this.faqs(merchant),
      policies: {
        returns: str(mc?.returnPolicy),
        delivery: str(asRecord(mc?.shippingConfig)?.shippingPolicy),
        privacyUrl: cfg?.privacyPolicyUrl ?? null,
      },
      hours:
        cfg && cfg.openingHours.length > 0
          ? (() => {
              const status = this.deliveryConfigService.isOpen(cfg, ctx.now);
              return {
                openNow: status.open,
                nextOpening: status.nextOpening ?? null,
                windows: cfg.openingHours,
              };
            })()
          : null,
      zones:
        cfg && cfg.zones.length > 0
          ? cfg.zones.map((z) => ({
              name: z.name,
              fee: z.fee,
              minOrder: z.minOrder,
              etaMinutes: z.etaMinutes,
            }))
          : null,
      payments: this.payments(mc?.paymentMethods),
      pickupEnabled: cfg ? cfg.pickupEnabled : null,
    };
  }

  private faqs(merchant: {
    id: string;
    name: string;
    industry: string | null;
    playbookConfig: unknown;
  }): BusinessInfo['faqs'] {
    const custom = asRecord(merchant.playbookConfig);
    if (!custom || !Array.isArray(custom.faqs)) return null; // sin FAQ del comercio → null (no defaults)
    const playbook = this.playbookService.getPlaybookForMerchant({
      id: merchant.id,
      name: merchant.name,
      industry: merchant.industry as Industry | null,
      playbookConfig: custom,
    });
    const faqs = (playbook.faqs ?? [])
      .filter((f) => str(f.question) && str(f.answer))
      .map((f) => ({ question: f.question, answer: f.answer }));
    return faqs.length > 0 ? faqs : null;
  }

  private payments(raw: unknown): BusinessInfo['payments'] {
    if (!Array.isArray(raw)) return null;
    const list = raw
      .map(asRecord)
      .filter((pm): pm is Record<string, unknown> => pm !== null && str(pm.type) !== null)
      .map((pm) => ({
        type: pm.type as string,
        label: str(pm.label) ?? (pm.type as string),
        instructions: paymentInstructions(pm),
      }));
    return list.length > 0 ? list : null;
  }
}
