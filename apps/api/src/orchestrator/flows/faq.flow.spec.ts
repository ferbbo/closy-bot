import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { FaqFlow } from './faq.flow';
import { PlaybookService, MerchantPlaybookData } from '../../services/playbook.service';
import type { PlaybookConfig, Faq } from '../../domain/entities/playbook-config.interface';
import { GenericPlaybookDefaults } from '../../domain/entities/playbook-defaults/generic.config';

/**
 * FaqFlow Unit Tests — PR-GAP-2 / PR-FE-OB-2
 * Evidence for AC-03: FaqFlow.handle() match/no-match/threshold boundary
 * Evidence for AC-09: normalización tildes/mayúsculas
 * Evidence for AC-12 (PR-FE-OB-2): Bot responde FAQ editada con keywords auto-generados
 */

const makeFaq = (keywords: string[], answer: string, question = 'Pregunta test'): Faq => ({
  question,
  keywords,
  answer,
});

const makeMerchant = (_faqs?: Faq[]): MerchantPlaybookData => ({
  id: 'merchant-1',
  name: 'TestMerchant',
});

const makePlaybookConfig = (faqs: Faq[]): PlaybookConfig => ({
  ...GenericPlaybookDefaults,
  faqs,
});

describe('AC-03: FaqFlow — keyword scoring + threshold (PR-GAP-2)', () => {
  let flow: FaqFlow;

  const buildFlow = async (threshold = 1, faqs: Faq[] = []) => {
    const resolvedConfig = makePlaybookConfig(faqs);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FaqFlow,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: unknown) => {
              if (key === 'FAQ_MATCH_THRESHOLD') return threshold;
              return defaultValue;
            }),
          },
        },
        {
          provide: PlaybookService,
          useValue: {
            getPlaybookForMerchant: jest.fn().mockReturnValue(resolvedConfig),
          },
        },
      ],
    }).compile();
    return module.get<FaqFlow>(FaqFlow);
  };

  const merchant = makeMerchant([]);

  // ─── Happy path ──────────────────────────────────────────────────────────

  it('AC-03: returns answer when score >= threshold (score=2, threshold=1)', async () => {
    const faqs = [makeFaq(['envio', 'demora', 'llega'], 'Los envíos demoran 3-5 días hábiles 📦')];
    flow = await buildFlow(1, faqs);
    const result = flow.handle(merchant, '¿Cuánto demora el envío?');
    expect(result).toBe('Los envíos demoran 3-5 días hábiles 📦');
  });

  it('AC-03: returns null when score < threshold (score=1, threshold=2)', async () => {
    const faqs = [makeFaq(['envio', 'demora', 'llega'], 'Los envíos demoran 3-5 días hábiles 📦')];
    flow = await buildFlow(2, faqs);
    // "llega" matches 1 keyword but threshold is 2
    const result = flow.handle(merchant, '¿Cuándo llega?');
    expect(result).toBeNull();
  });

  it('AC-03: returns null when no keywords match', async () => {
    const faqs = [makeFaq(['envio', 'demora'], 'Los envíos demoran 3-5 días hábiles 📦')];
    flow = await buildFlow(1, faqs);
    const result = flow.handle(merchant, '¿Venden bicicletas?');
    expect(result).toBeNull();
  });

  // ─── Edge cases ───────────────────────────────────────────────────────────

  it('AC-03: returns null immediately when faqs array is empty', async () => {
    flow = await buildFlow(1, []);
    const result = flow.handle(merchant, '¿Cuánto demora el envío?');
    expect(result).toBeNull();
  });

  it('AC-03: returns null when playbookConfig has no faqs field', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FaqFlow,
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(1) },
        },
        {
          provide: PlaybookService,
          useValue: {
            getPlaybookForMerchant: jest.fn().mockReturnValue({
              ...GenericPlaybookDefaults,
              faqs: undefined,
            }),
          },
        },
      ],
    }).compile();
    flow = module.get<FaqFlow>(FaqFlow);
    const result = flow.handle(merchant, '¿Cuánto demora el envío?');
    expect(result).toBeNull();
  });

  // ─── Multiple FAQs ────────────────────────────────────────────────────────

  it('AC-03: picks FAQ with highest score among multiple FAQs', async () => {
    const faqs = [
      makeFaq(['pago', 'transferencia'], 'Aceptamos transferencia 💳', '¿Cómo pago?'),
      makeFaq(['envio', 'demora', 'llega'], 'Los envíos demoran 3-5 días 📦', '¿Envío?'),
    ];
    flow = await buildFlow(1, faqs);
    // "envio demora" matches 2 keywords of FAQ[1], only 0 of FAQ[0]
    const result = flow.handle(merchant, 'cuanto demora el envio');
    expect(result).toBe('Los envíos demoran 3-5 días 📦');
  });

  it('AC-03: on score tie, picks FIRST FAQ in array (order matters)', async () => {
    const faqs = [
      makeFaq(['pago', 'cambio'], 'Respuesta A', 'FAQ A'),
      makeFaq(['pago', 'devolver'], 'Respuesta B', 'FAQ B'),
    ];
    flow = await buildFlow(1, faqs);
    // "pago" matches 1 keyword in FAQ[0] AND FAQ[1] → tie → picks first (A)
    const result = flow.handle(merchant, 'como pago');
    expect(result).toBe('Respuesta A');
  });

  // ─── Normalización AC-09 ─────────────────────────────────────────────────

  it('AC-09: normalizes tildes — "Envío" matches keyword "envio"', async () => {
    const faqs = [makeFaq(['envio', 'demora'], 'Respuesta envío 📦')];
    flow = await buildFlow(1, faqs);
    const result = flow.handle(merchant, 'Envío demora mucho?');
    expect(result).toBe('Respuesta envío 📦');
  });

  it('AC-09: normalizes uppercase — "DEMORA" matches keyword "demora"', async () => {
    const faqs = [makeFaq(['demora', 'envio'], 'Respuesta demora 📦')];
    flow = await buildFlow(1, faqs);
    const result = flow.handle(merchant, 'DEMORA EL ENVIO?');
    expect(result).toBe('Respuesta demora 📦');
  });

  it('AC-09: normalizes both tildes and uppercase together', async () => {
    const faqs = [makeFaq(['devolucion', 'cambio'], 'Aceptamos devoluciones 30 días')];
    flow = await buildFlow(1, faqs);
    const result = flow.handle(merchant, 'DEVOLUCIÓN de un producto');
    expect(result).toBe('Aceptamos devoluciones 30 días');
  });

  it('AC-09: keyword with tilde in preset matches query without tilde', async () => {
    // FAQ keyword is "envío" (with tilde), query is "envio" (no tilde)
    const faqs = [makeFaq(['envío', 'demora'], 'Respuesta normalizada 📦')];
    flow = await buildFlow(1, faqs);
    const result = flow.handle(merchant, 'el envio tarda mucho');
    expect(result).toBe('Respuesta normalizada 📦');
  });

  // ─── normalizeText() unit ─────────────────────────────────────────────────

  it('AC-09: normalizeText() strips accents, lowercases, collapses spaces', async () => {
    flow = await buildFlow(1, []);
    expect(flow.normalizeText('Búsco  Camisetas ')).toBe('busco camisetas');
    expect(flow.normalizeText('ENVÍO')).toBe('envio');
    expect(flow.normalizeText('Devolución')).toBe('devolucion');
  });
});

// ---------------------------------------------------------------------------
// AC-12 (PR-FE-OB-2): Bot responde FAQ editada con keywords auto-generados
// ---------------------------------------------------------------------------

describe('AC-12 (PR-FE-OB-2): Bot responds to edited FAQ with auto-generated keywords', () => {
  let flow: FaqFlow;

  const buildFlow = async (faqs: Faq[]) => {
    const resolvedConfig: PlaybookConfig = { ...GenericPlaybookDefaults, faqs };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FaqFlow,
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(1) },
        },
        {
          provide: PlaybookService,
          useValue: { getPlaybookForMerchant: jest.fn().mockReturnValue(resolvedConfig) },
        },
      ],
    }).compile();
    return module.get<FaqFlow>(FaqFlow);
  };

  const merchant = makeMerchant();

  it('matches edited FAQ with keywords auto-generated by frontend normalizer', async () => {
    // Simula un FAQ editado desde step-customize con keywords generados por normalizeKeywords()
    // Input frontend: question = "¿Cuánto cuesta el envío?" → keywords = ["cuanto", "cuesta", "el", "envio"]
    const editedFaq = makeFaq(
      ['cuanto', 'cuesta', 'el', 'envio'],
      'El envío cuesta $10.000 a toda Colombia 🚚',
      '¿Cuánto cuesta el envío?',
    );
    flow = await buildFlow([editedFaq]);

    const result = flow.handle(merchant, '¿cuánto cuesta enviar?');
    expect(result).toBe('El envío cuesta $10.000 a toda Colombia 🚚');
  });

  it('matches FAQ with custom answer after merchant edits it in wizard', async () => {
    // Merchant editó la respuesta default "3-5 días" → custom "1-2 días"
    const customFaq = makeFaq(
      ['envio', 'demora', 'llega', 'tiempo', 'dias'],
      '¡Envíos express! 1-2 días hábiles 🚀',
      '¿Cuánto demora el envío?',
    );
    flow = await buildFlow([customFaq]);

    const result = flow.handle(merchant, '¿cuánto demora el envío?');
    expect(result).toBe('¡Envíos express! 1-2 días hábiles 🚀');
  });

  it('does NOT match if none of the auto-generated keywords appear in query', async () => {
    const faq = makeFaq(
      ['garantia', 'defecto', 'danado', 'roto'],
      'Garantía 30 días ✅',
      '¿Tienen garantía?',
    );
    flow = await buildFlow([faq]);

    const result = flow.handle(merchant, '¿cuánto cuesta un producto?');
    expect(result).toBeNull();
  });
});
