# PR Brief — PR-11 — Playbooks: ropa/belleza/minimarket (defaults)

> Archivo: `docs/plan/pr-briefs/PR-11-playbooks-ropa-belleza-minimarket.md`
> 
> Regla: 1 página. Machine-actionable. Sin scope extra.

## Objetivo

Configurar **defaults por industria** (ropa, belleza, minimarket) mediante playbooks predefinidos que contienen: prompts LLM expandidos, preguntas mínimas por flow, mensajes base, y reglas/configuración específicas. El merchant selecciona su playbook al registrarse y esto ajusta el comportamiento del bot automáticamente.

## Scope fence

### ✅ Included

**1. Modelo de datos (Prisma)**
- Campo `industry` en modelo `Merchant`: enum `['ropa', 'belleza', 'minimarket']`
- Campo opcional `playbookConfig` (JSONB) para overrides personalizados

**2. Expansión de prompts LLM (expandir stubs de PR-03.6)**
- Completar `apps/api/src/llm/prompts/industry-defaults/ropa.ts`
- Completar `apps/api/src/llm/prompts/industry-defaults/belleza.ts`
- Completar `apps/api/src/llm/prompts/industry-defaults/minimarket.ts`
- Cada archivo exporta:
  - `tone`: instrucciones de tono/personalidad para LLM
  - `focusAreas`: aspectos clave a preguntar (ej. talla, color)
  - `commonQuestions`: FAQs predefinidas
  - `upsellStrategy`: sugerencias de venta cruzada
  - `emojis`: uso permitido de emojis (moderado/frecuente)

**3. PlaybookConfig interface (TypeScript)**
- Interface central `PlaybookConfig` en `apps/api/src/domain/entities/`
- Define estructura común para todos los playbooks
- Incluye: `checkoutQuestions`, `messages`, `rules`, `llmPrompt`

**4. Composición de prompts en LlmService**
- Modificar `LlmService.buildSystemPrompt()` para usar el playbook del merchant
- Lógica: `basePrompt + industryDefaultPrompt + merchantOverrides + context`

**5. Defaults de checkout por playbook**
- **Ropa**: preguntar talla + color (si aplica) antes de agregar al carrito
- **Belleza**: preguntar tipo de piel (opcional: "cualquiera"), preferencias
- **Minimarket**: notificar sobre sustituciones automáticas si producto agotado

**6. Mensajes base por playbook**
- Greeting personalizado por industria
- Mensaje de bienvenida con tono ajustado
- Ejemplo:
  - Ropa: "¡Hola! 👗 Soy tu asistente de {merchant_name}. ¿Qué estilo buscas hoy?"
  - Belleza: "¡Hola! ✨ Soy tu asistente de {merchant_name}. ¿Qué producto necesitas?"
  - Minimarket: "¡Hola! 🛒 Soy tu asistente de {merchant_name}. ¿Qué necesitas para tu hogar?"

**7. Seed script**
- Archivo `prisma/seed-playbooks.ts`
- Crea merchants de ejemplo con cada playbook para testing
- Ejecutable con `pnpm db:seed:playbooks`

**8. Tests**
- Tests unitarios para composition de prompts por playbook
- Test de selección correcta de playbook según merchant
- Test de fallback si merchant no tiene `industry` definido

### ❌ Excluded

- Editor visual de playbooks (UI admin) - futuro
- Customización avanzada por merchant (más allá de overrides simples)
- Playbooks adicionales (ej. farmacia, restaurant) - fase 2
- RAG/Knowledge Base por playbook - PR separado
- Reglas complejas tipo "si X entonces Y" - mantener simple
- A/B testing de playbooks - futuro
- Multi-idioma - solo español en MVP
- Configuración de emojis personalizados más allá de frecuencia

## Paths a tocar (concretos)

```
prisma/
├── schema.prisma                             # Modificar: agregar industry + playbookConfig a Merchant
└── seed-playbooks.ts                         # NUEVO: seed para testing

apps/api/src/domain/entities/
├── playbook-config.interface.ts              # NUEVO: interface central
└── playbook-defaults/                        # NUEVO: configs por industria
    ├── ropa.config.ts
    ├── belleza.config.ts
    └── minimarket.config.ts

apps/api/src/llm/prompts/industry-defaults/
├── ropa.ts                                   # Expandir stub de PR-03.6
├── belleza.ts                                # Expandir stub de PR-03.6
└── minimarket.ts                             # Expandir stub de PR-03.6

apps/api/src/llm/
└── llm.service.ts                            # Modificar: buildSystemPrompt() usa playbook

apps/api/src/services/
├── merchant-resolver.service.ts              # Modificar: resolver incluye playbook
└── playbook.service.ts                       # NUEVO: lógica de selección/composición

apps/api/src/orchestrator/flows/
├── greeting.flow.ts                          # Modificar: usar mensaje de playbook
└── catalog-search.flow.ts                    # Modificar: preguntas según playbook

apps/api/src/persistence/repositories/
└── merchant.repository.ts                    # Modificar: incluir industry en queries

apps/api/src/common/dto/
└── merchant.dto.ts                           # Agregar campo industry
```

## Contratos / Interfaces

### Prisma Schema (agregar a Merchant)

```prisma
model Merchant {
  id              String       @id @default(cuid())
  name            String
  phone           String       @unique  // WhatsApp number
  industry        Industry?                   // NUEVO
  playbookConfig  Json?                       // NUEVO: overrides opcionales
  // ... campos existentes
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt
}

enum Industry {
  ropa
  belleza
  minimarket
}
```

### PlaybookConfig Interface

```typescript
// apps/api/src/domain/entities/playbook-config.interface.ts

export interface PlaybookConfig {
  industry: 'ropa' | 'belleza' | 'minimarket';
  
  llmPrompt: LlmPromptConfig;
  
  checkoutQuestions: CheckoutQuestion[];
  
  messages: PlaybookMessages;
  
  rules: PlaybookRules;
}

export interface LlmPromptConfig {
  tone: string;                     // Instrucciones de tono para LLM
  focusAreas: string[];             // ["talla", "color", "stock"]
  commonQuestions: string[];        // FAQs predefinidas
  upsellStrategy: string;           // Cómo sugerir productos adicionales
  emojiUsage: 'none' | 'moderate' | 'frequent';
}

export interface CheckoutQuestion {
  key: string;                      // "size", "skin_type", "substitution_ok"
  label: string;                    // "¿Qué talla?"
  type: 'text' | 'choice' | 'boolean';
  required: boolean;
  options?: string[];               // ["S", "M", "L", "XL"]
  default?: string;
}

export interface PlaybookMessages {
  greeting: string;                 // Mensaje inicial
  addToCartConfirm: string;         // "Agregado al carrito! 🛒"
  noStock: string;                  // "Lo siento, no hay stock"
  upsellTemplate: string;           // "Te podría interesar {product}"
  checkoutStart: string;            // "¡Perfecto! Confirmemos tu pedido"
}

export interface PlaybookRules {
  askSizeBeforeCart: boolean;       // Ropa: true, otros: false
  askSkinTypeOnSearch: boolean;     // Belleza: true, otros: false
  autoSubstitutions: boolean;       // Minimarket: true, otros: false
  upsellEnabled: boolean;
  maxRecommendations: number;       // 3-5
}
```

### PlaybookService

```typescript
// apps/api/src/services/playbook.service.ts

@Injectable()
export class PlaybookService {
  /**
   * Obtiene config de playbook para un merchant
   * Combina: defaults de industria + overrides del merchant
   */
  getPlaybookForMerchant(merchant: Merchant): PlaybookConfig;

  /**
   * Obtiene prompt LLM para un merchant según su playbook
   */
  getLlmPromptForMerchant(merchant: Merchant): LlmPromptConfig;

  /**
   * Valida si un playbook config tiene estructura válida
   */
  validatePlaybookConfig(config: unknown): boolean;
}
```

### Defaults de industria

**Ropa** (`ropa.config.ts`):
```typescript
export const RopaPlaybookDefaults: PlaybookConfig = {
  industry: 'ropa',
  llmPrompt: {
    tone: 'Conversacional, moderno, entusiasta. Usa emojis de moda 👗👕✨',
    focusAreas: ['talla', 'color', 'estilo', 'ocasión'],
    commonQuestions: [
      '¿Tienes en otra talla?',
      '¿Qué colores disponibles?',
      '¿Cuándo llega?',
      'Políticas de cambio'
    ],
    upsellStrategy: 'Sugerir complementos: cinturón con pantalón, bolso con vestido',
    emojiUsage: 'frequent'
  },
  checkoutQuestions: [
    {
      key: 'size',
      label: '¿Qué talla necesitas?',
      type: 'choice',
      required: true,
      options: ['XS', 'S', 'M', 'L', 'XL', 'XXL']
    },
    {
      key: 'color',
      label: '¿Qué color prefieres?',
      type: 'text',
      required: false
    }
  ],
  messages: {
    greeting: '¡Hola! 👗 Soy tu asistente de {merchant_name}. ¿Qué estilo buscas hoy?',
    addToCartConfirm: '¡Genial! Agregado al carrito 🛒',
    noStock: 'Uy, ese modelo está agotado 😔. Te puedo notificar cuando llegue o mostrarte algo similar?',
    upsellTemplate: 'Este {product} combina perfecto con lo que elegiste ✨',
    checkoutStart: '¡Perfecto! Vamos a confirmar tu pedido 📦'
  },
  rules: {
    askSizeBeforeCart: true,
    askSkinTypeOnSearch: false,
    autoSubstitutions: false,
    upsellEnabled: true,
    maxRecommendations: 4
  }
};
```

**Belleza** (`belleza.config.ts`):
```typescript
export const BellezaPlaybookDefaults: PlaybookConfig = {
  industry: 'belleza',
  llmPrompt: {
    tone: 'Profesional pero cercano, empático. Usa emojis de belleza ✨💄💅',
    focusAreas: ['tipo de piel', 'preocupaciones', 'alergias', 'preferencias'],
    commonQuestions: [
      '¿Es para piel seca/grasa/mixta?',
      '¿Tienes alergias?',
      '¿Probado antes?',
      '¿Cuánto dura?'
    ],
    upsellStrategy: 'Ofrecer rutina completa: limpiador + tratamiento + hidratante',
    emojiUsage: 'moderate'
  },
  checkoutQuestions: [
    {
      key: 'skin_type',
      label: '¿Qué tipo de piel tienes?',
      type: 'choice',
      required: false,
      options: ['Seca', 'Grasa', 'Mixta', 'Sensible', 'Normal'],
      default: 'Normal'
    },
    {
      key: 'allergies',
      label: '¿Tienes alguna alergia o sensibilidad?',
      type: 'text',
      required: false
    }
  ],
  messages: {
    greeting: '¡Hola! ✨ Soy tu asistente de {merchant_name}. ¿Qué producto de belleza necesitas?',
    addToCartConfirm: 'Perfecto! Agregado a tu carrito 💄',
    noStock: 'Ese producto está agotado temporalmente. Puedo recomendarte una alternativa similar?',
    upsellTemplate: 'Para complementar, te recomiendo {product} ✨',
    checkoutStart: '¡Excelente elección! Confirmemos tu pedido 📦'
  },
  rules: {
    askSizeBeforeCart: false,
    askSkinTypeOnSearch: true,
    autoSubstitutions: false,
    upsellEnabled: true,
    maxRecommendations: 3
  }
};
```

**Minimarket** (`minimarket.config.ts`):
```typescript
export const MinimarketPlaybookDefaults: PlaybookConfig = {
  industry: 'minimarket',
  llmPrompt: {
    tone: 'Práctico, eficiente, amigable. Emojis básicos 🛒📦',
    focusAreas: ['categoría', 'cantidad', 'sustituciones', 'urgencia'],
    commonQuestions: [
      '¿Tienes X producto?',
      '¿Entregan hoy?',
      '¿Aceptan sustituciones?',
      'Mínimo de compra?'
    ],
    upsellStrategy: 'Recordar productos relacionados: pan con mermelada, café con leche',
    emojiUsage: 'moderate'
  },
  checkoutQuestions: [
    {
      key: 'substitution_ok',
      label: 'Si algo no hay, ¿te parece bien que lo sustituyamos por similar?',
      type: 'boolean',
      required: true,
      default: 'true'
    }
  ],
  messages: {
    greeting: '¡Hola! 🛒 Soy tu asistente de {merchant_name}. ¿Qué necesitas para tu hogar?',
    addToCartConfirm: 'Listo! Agregado a tu carrito 🛒',
    noStock: 'Ese producto está agotado. Puedo sugerirte algo similar o lo quito del pedido?',
    upsellTemplate: 'También tenemos {product}, te podría servir?',
    checkoutStart: 'Perfecto! Vamos a confirmar tu pedido 📦'
  },
  rules: {
    askSizeBeforeCart: false,
    askSkinTypeOnSearch: false,
    autoSubstitutions: true,
    upsellEnabled: true,
    maxRecommendations: 5
  }
};
```

### Seed Script

```typescript
// prisma/seed-playbooks.ts

async function seedPlaybooks() {
  const merchants = [
    {
      name: 'Fashion Store Demo',
      phone: '+573001111111',
      industry: 'ropa',
    },
    {
      name: 'Beauty Corner Demo',
      phone: '+573002222222',
      industry: 'belleza',
    },
    {
      name: 'Minimarket Express Demo',
      phone: '+573003333333',
      industry: 'minimarket',
    },
  ];

  for (const merchant of merchants) {
    await prisma.merchant.upsert({
      where: { phone: merchant.phone },
      update: {},
      create: merchant,
    });
  }
}
```

## Comportamiento

### Happy path

1. **Merchant registrado con playbook**
   - Admin/seed setea `merchant.industry = 'ropa'`
   - Sistema carga `RopaPlaybookDefaults` automáticamente

2. **Composición de prompt LLM**
   - `LlmService.buildSystemPrompt()` llamado
   - Compone: `basePrompt + ropaPlaybook.llmPrompt.tone + merchantContext`
   - Resultado: LLM responde con tono/emojis de Ropa

3. **Flow de búsqueda (Ropa)**
   - Usuario: "busco jeans"
   - Bot muestra productos
   - Usuario: "quiero estos"
   - Bot (reglas playbook): "¿Qué talla necesitas?" (askSizeBeforeCart=true)
   - Usuario: "M"
   - Bot: "¡Genial! Agregado al carrito 🛒" (mensaje de playbook)

4. **Flow de búsqueda (Belleza)**
   - Usuario: "busco crema hidratante"
   - Bot (reglas playbook): "¿Qué tipo de piel tienes?" (askSkinTypeOnSearch=true)
   - Usuario: "mixta"
   - Bot muestra productos filtrados para piel mixta

5. **Checkout con preguntas de playbook**
   - Usuario inicia checkout
   - Bot itera sobre `playbook.checkoutQuestions`
   - Ropa: pregunta talla + color
   - Belleza: pregunta tipo de piel + alergias
   - Minimarket: pregunta sustituciones ok

### Edge cases

- **Merchant sin `industry` definido**
  - Fallback: usar playbook "generic" con defaults mínimos
  - Log warning para que admin configure

- **Industry inválido**
  - Validación en Prisma enum
  - Si llega caso inválido, fallback a generic

- **PlaybookConfig custom inválido**
  - Validar estructura antes de guardar
  - Si falla, usar defaults y log error

- **MerchantResolver no encuentra merchant**
  - Fallback a playbook generic
  - Handoff temprano si conversación crítica

- **LLM disabled pero playbook usa prompt**
  - Fallback a mensajes templated del playbook
  - `playbook.messages.*` se usan directamente sin LLM

## Acceptance criteria (verificables)

- [ ] Campo `industry` agregado a modelo `Merchant` en Prisma
- [ ] Enum `Industry` con valores: `ropa`, `belleza`, `minimarket`
- [ ] Migración de Prisma ejecuta sin errores
- [ ] Interface `PlaybookConfig` definida y exportada
- [ ] Configs completos para 3 playbooks: ropa, belleza, minimarket
- [ ] Cada config incluye: `llmPrompt`, `checkoutQuestions`, `messages`, `rules`
- [ ] Prompts LLM expandidos en `prompts/industry-defaults/` (ropa/belleza/minimarket)
- [ ] `PlaybookService.getPlaybookForMerchant()` retorna config correcto según industry
- [ ] `LlmService.buildSystemPrompt()` compone prompt con playbook del merchant
- [ ] Seed script crea 3 merchants con playbooks diferentes
- [ ] Greeting flow usa `playbook.messages.greeting` según merchant
- [ ] Checkout flow pregunta campos de `playbook.checkoutQuestions`
- [ ] Reglas de playbook aplicadas:
  - [ ] Ropa: pregunta talla antes de agregar al carrito
  - [ ] Belleza: pregunta tipo de piel al buscar
  - [ ] Minimarket: notifica sobre sustituciones
- [ ] Fallback a playbook generic si merchant sin industry
- [ ] Tests unitarios: composición de prompts por playbook
- [ ] Tests unitarios: selección correcta de playbook
- [ ] Tests unitarios: validación de PlaybookConfig
- [ ] Test e2e: merchant con playbook "ropa" → greeting correcto
- [ ] `pnpm lint` pasa sin errores
- [ ] `pnpm test` pasa sin errores
- [ ] Documentación actualizada en README con info de playbooks

## Comandos para validar

```bash
# Lint
pnpm lint

# Tests unitarios
pnpm test

# Tests específicos de playbooks
pnpm test playbook

# Migración de BD
pnpm db:migrate

# Seed de playbooks
pnpm db:seed:playbooks

# Dev server
pnpm dev

# Test manual: enviar mensaje a merchant con playbook específico
curl -X POST http://localhost:3000/webhooks/whatsapp \
  -H "Content-Type: application/json" \
  -d '{
    "entry": [{
      "changes": [{
        "value": {
          "messages": [{
            "from": "5493001234567",
            "id": "wamid.test123",
            "text": { "body": "hola" },
            "timestamp": "1234567890"
          }],
          "metadata": {
            "phone_number_id": "573001111111"  // merchant con playbook ropa
          }
        }
      }]
    }]
  }'
# Verificar que respuesta use tono/emojis de playbook Ropa
```

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| **Playbook muy rígido, merchant quiere customizar** | Campo `playbookConfig` (JSONB) permite overrides; futuro: editor visual |
| **Preguntas de playbook molestan al usuario** | Hacer preguntas opcionales (default values); skip si usuario ya proveyó info |
| **Mantener 3 playbooks en sync es tedioso** | Abstraer lógica común en `PlaybookConfig` interface; testear estructura |
| **LLM no respeta tono del playbook** | Guardrails en base prompt + ejemplos en industry prompt; validar outputs |
| **Más industrias después (ej. farmacia)** | Diseño modular facilita agregar nuevos playbooks; seguir misma interface |
| **Seed script colisiona con datos reales** | Usar números de teléfono fake con prefijo +573000; disclaimer en seed |
| **Migration falla en prod con data existente** | Campo `industry` opcional (nullable); migration sin downtime |

## Notas

### Guardrails (recordatorio)

- Playbooks NO deben permitir que LLM invente:
  - Precios diferentes a los del catálogo
  - Stock inexistente
  - Políticas de envío/cambio no configuradas
  - ETAs de entrega sin data real

### PII

- Preguntas tipo "¿alergias?" son opcionales y no obligatorias
- No loguear respuestas de usuarios a preguntas sensibles (ej. alergias)

### Extensibilidad

- En futuro: playbooks customizables por merchant via UI
- Por ahora: defaults fijos + overrides por campo `playbookConfig` (JSON)

### Testing

- Priorizar tests de composición de prompts (crítco para LLM)
- Test e2e debe validar que el flujo difiere según playbook (ej. pregunta talla en Ropa pero no en Minimarket)

### Documentación

- Actualizar `README.md` con sección "Playbooks disponibles"
- Documentar en `docs/mvp-core-v1.md` §6 que playbooks están implementados

---

## Dependencias

- **Depende de:**
  - ✅ PR-02 (Merchant model)
  - ✅ PR-03.6 (LLM prompts stubs) - **CRÍTICO: expandir stubs**
  - 🟡 PR-04 (Carrito) - **recomendado** para probar reglas de checkout
  - 🟡 PR-05 (Checkout) - **recomendado** para probar `checkoutQuestions`

- **Habilita:**
  - PR-09 (Carrito abandonado) - mensajes personalizados por playbook
  - RAG/Knowledge Base - FAQs por playbook
  - Futuro: editor visual de playbooks

## Referencias

- MVP Core V1: `docs/mvp-core-v1.md` §5 (Casos de uso por nicho)
- PR Stack: `docs/plan/PR-STACK-core-v1.md` (PR-11)
- PR-03.6 Brief: `docs/plan/pr-briefs/PR-03.6-llm-adapter-groq-system-prompt.md` (stubs de prompts)
- Issue: [#11](https://github.com/ferbbo/closy-bot/issues/11)
