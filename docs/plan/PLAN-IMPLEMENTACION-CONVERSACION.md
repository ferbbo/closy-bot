# Plan Implementable: Bot Conversacional End-to-End
> **Estado actual:** El bot puede recibir mensajes pero NO puede responder  
> **Objetivo:** Implementar conversación bidireccional + búsqueda de catálogo  
> **Prioridad:** 🔴 CRÍTICA (bloquea funcionalidades de venta)

---

## 📊 Estado Actual vs Requerido

| Componente | Estado | RF Impactados |
|------------|--------|---------------|
| Inbound webhook + dedupe | ✅ Funcionando | RF-01, RF-02 |
| Identity (Customer/Conversation) | ✅ Funcionando | RF-05, RF-06 |  
| Catálogo + búsqueda | ✅ Funcionando | RF-08, RF-09 |
| **Outbound Sender** | ❌ Falta | RF-03 |
| **Orchestrator** | ❌ Placeholder | RF-04, RF-07 |
| **Intent Router** | ❌ Falta | - |
| **Pipeline conexión** | ❌ Falta | RF-10, RF-11 |

---

## 🎯 Plan de Implementación (8 Pasos)

### Paso 1: WhatsApp Outbound Service
**Duración estimada:** 4 horas  
**Riesgo:** Medio (configuración API externa)

#### Archivos a crear:
```
apps/api/src/channels/whatsapp/
├── whatsapp-outbound.service.ts
├── whatsapp-outbound.service.spec.ts
├── dto/send-message.dto.ts
└── interfaces/whatsapp-api.interface.ts
```

#### Código base:
```typescript
// whatsapp-outbound.service.ts
@Injectable()
export class WhatsAppOutboundService {
  private readonly logger = new Logger(WhatsAppOutboundService.name);
  private readonly httpService: HttpService;
  
  constructor(private configService: ConfigService) {}
  
  async sendTextMessage(to: string, text: string): Promise<SendMessageResult> {
    const payload = {
      messaging_product: "whatsapp",
      to: this.normalizePhone(to),
      type: "text",
      text: { body: text }
    };
    
    try {
      const response = await this.httpService.post(
        `${this.getApiUrl()}/messages`,
        payload,
        { headers: this.getHeaders() }
      ).toPromise();
      
      return { success: true, messageId: response.data.messages[0].id };
    } catch (error) {
      this.logger.error(`Failed to send message: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
}
```

#### Variables de entorno:
```env
WHATSAPP_ACCESS_TOKEN=EAAxxxxxxx
WHATSAPP_PHONE_NUMBER_ID=123456789
WHATSAPP_API_VERSION=v18.0
```

---

### Paso 2: Intent Router Service  
**Duración estimada:** 3 horas  
**Riesgo:** Bajo (lógica simple)

#### Archivos a crear:
```
apps/api/src/orchestrator/intent/
├── intent-router.service.ts
├── intent-router.service.spec.ts
└── intent.types.ts
```

#### Lógica de clasificación:
```typescript
// intent-router.service.ts
export class IntentRouterService {
  classify(text: string): IntentResult {
    const normalizedText = text.toLowerCase().trim();
    
    // Patterns for search
    if (this.isSearchPattern(normalizedText)) {
      return {
        intent: 'SEARCH_PRODUCT',
        confidence: 0.9,
        entities: { query: this.extractSearchQuery(normalizedText) }
      };
    }
    
    // Patterns for greeting
    if (this.isGreetingPattern(normalizedText)) {
      return { intent: 'GREETING', confidence: 0.8 };
    }
    
    // Default fallback
    return { intent: 'UNKNOWN', confidence: 0.3 };
  }
  
  private isSearchPattern(text: string): boolean {
    const searchKeywords = ['busco', 'quiero', 'tienes', 'necesito', 'buscar'];
    return searchKeywords.some(keyword => text.includes(keyword));
  }
}
```

---

### Paso 3: Flow Handlers
**Duración estimada:** 6 horas  
**Riesgo:** Medio (lógica de negocio)

#### Archivos a crear:
```
apps/api/src/orchestrator/flows/
├── base.flow.ts
├── search-catalog.flow.ts
├── greeting.flow.ts
├── help.flow.ts
└── flows.module.ts
```

#### Flow de búsqueda catálogo:
```typescript
// search-catalog.flow.ts
@Injectable()
export class SearchCatalogFlow extends BaseFlow {
  constructor(private catalogService: CatalogService) {}
  
  async handle(input: FlowInput): Promise<FlowResult> {
    const { query } = input.entities;
    
    if (!query || query.trim().length < 2) {
      return { 
        response: "¿Qué productos estás buscando? Puedes decirme algo como 'busco zapatillas' o 'quiero camisas'",
        shouldContinue: true 
      };
    }
    
    const products = await this.catalogService.searchProducts(
      input.merchantId,
      query,
      5 // max results
    );
    
    if (products.length === 0) {
      return {
        response: `No encontré productos que coincidan con "${query}". ¿Podrías intentar con otros términos?`,
        shouldContinue: true
      };
    }
    
    const productList = products.map((p, i) => 
      `${i + 1}. ${p.name} - $${p.variants[0]?.price || 'N/A'} ${p.variants[0]?.stock > 0 ? '✅' : '❌'}`
    ).join('\n');
    
    return {
      response: `Encontré estos productos para "${query}":\n\n${productList}\n\n¿Te interesa alguno?`,
      shouldContinue: true,
      metadata: { products: products.map(p => p.id) }
    };
  }
}
```

---

### Paso 4: Conversation Orchestrator
**Duración estimada:** 8 horas  
**Riesgo:** Alto (integración compleja)

#### Archivos a crear/modificar:
```
apps/api/src/orchestrator/
├── conversation.orchestrator.ts
├── conversation.orchestrator.spec.ts
├── merchant-resolver.service.ts
└── orchestrator.module.ts (activar)
```

#### Pipeline principal:
```typescript
// conversation.orchestrator.ts
@Injectable()
export class ConversationOrchestrator {
  constructor(
    private merchantResolver: MerchantResolverService,
    private customerService: CustomerService,
    private conversationService: ConversationService,
    private intentRouter: IntentRouterService,
    private searchFlow: SearchCatalogFlow,
    private greetingFlow: GreetingFlow,
    private helpFlow: HelpFlow
  ) {}
  
  async process(input: OrchestratorInput): Promise<OrchestratorResult> {
    // 1. Resolve merchant
    const merchant = await this.merchantResolver.resolveByPhoneNumberId(
      input.receiverPhoneId
    );
    
    // 2. Resolve customer & conversation
    const customer = await this.customerService.resolveByPhone(input.from);
    const conversation = await this.conversationService.getOrCreateConversation(
      customer.id,
      merchant.id,
      'whatsapp'
    );
    
    // 3. Classify intent
    const intentResult = this.intentRouter.classify(input.text);
    
    // 4. Route to appropriate flow
    const flowInput: FlowInput = {
      ...input,
      merchantId: merchant.id,
      customerId: customer.id,
      conversationId: conversation.id,
      intent: intentResult.intent,
      entities: intentResult.entities || {}
    };
    
    const flowResult = await this.routeToFlow(intentResult.intent, flowInput);
    
    return {
      response: flowResult.response,
      shouldSend: true,
      conversationId: conversation.id,
      intent: intentResult.intent,
      metadata: flowResult.metadata
    };
  }
  
  private async routeToFlow(intent: IntentType, input: FlowInput): Promise<FlowResult> {
    switch (intent) {
      case 'SEARCH_PRODUCT': return this.searchFlow.handle(input);
      case 'GREETING': return this.greetingFlow.handle(input);
      case 'HELP': return this.helpFlow.handle(input);
      default: return { 
        response: "No entendí muy bien. Puedes decirme 'ayuda' para ver qué puedo hacer.", 
        shouldContinue: true 
      };
    }
  }
}
```

---

### Paso 5: Modificar WhatsApp Controller
**Duración estimada:** 2 horas  
**Riesgo:** Bajo (integración directa)

#### Archivo a modificar:
```
apps/api/src/channels/whatsapp/whatsapp.controller.ts
```

#### Cambios principales:
```typescript
@Controller('webhooks/whatsapp')
export class WhatsAppController {
  constructor(
    private readonly whatsappService: WhatsAppService,
    private readonly orchestrator: ConversationOrchestrator,
    private readonly outboundService: WhatsAppOutboundService
  ) {}
  
  @Post('inbound')
  async handleInbound(@Body() dto: InboundMessageDto): Promise<InboundMessageResponseDto> {
    try {
      // 1. Dedupe + persist (existing logic)
      const normalizedMessage = await this.whatsappService.processInboundMessage(dto);
      
      // 2. NEW: Process with orchestrator
      const orchestratorResult = await this.orchestrator.process({
        messageId: dto.message_id,
        from: dto.from,
        receiverPhoneId: this.extractReceiverPhoneId(dto), // from webhook metadata
        text: dto.text || '',
        timestamp: new Date(dto.timestamp)
      });
      
      // 3. NEW: Send response
      if (orchestratorResult.shouldSend) {
        await this.outboundService.sendTextMessage(
          dto.from,
          orchestratorResult.response
        );
      }
      
      return { processed: true };
    } catch (error) {
      // Error handling...
    }
  }
}
```

---

### Paso 6: Configuración y Dependencias
**Duración estimada:** 2 horas  
**Riesgo:** Bajo (configuración)

#### Archivos a modificar:
```
apps/api/src/common/config/env.validation.ts
apps/api/src/channels/whatsapp/whatsapp.module.ts
apps/api/src/orchestrator/orchestrator.module.ts
```

#### Nuevas variables de entorno:
```typescript
// env.validation.ts
export const envValidationSchema = Joi.object({
  // ... existing
  WHATSAPP_ACCESS_TOKEN: Joi.string().required(),
  WHATSAPP_PHONE_NUMBER_ID: Joi.string().required(),
  WHATSAPP_API_VERSION: Joi.string().default('v18.0'),
  WHATSAPP_API_URL: Joi.string().default('https://graph.facebook.com'),
});
```

#### Module updates:
```typescript
// whatsapp.module.ts
@Module({
  imports: [PersistenceModule, HttpModule, ConfigModule],
  controllers: [WhatsAppController],
  providers: [WhatsAppService, WhatsAppOutboundService],
  exports: [WhatsAppService, WhatsAppOutboundService],
})

// orchestrator.module.ts
@Module({
  imports: [ServicesModule, HttpModule],
  providers: [
    ConversationOrchestrator,
    IntentRouterService,
    MerchantResolverService,
    SearchCatalogFlow,
    GreetingFlow,
    HelpFlow,
  ],
  exports: [ConversationOrchestrator],
})
```

---

### Paso 7: Tests Críticos
**Duración estimada:** 6 horas  
**Riesgo:** Bajo (calidad)

#### Tests unitarios clave:
```typescript
// intent-router.service.spec.ts
describe('IntentRouterService', () => {
  it('should classify search intent', () => {
    const result = service.classify('busco zapatillas nike');
    expect(result.intent).toBe('SEARCH_PRODUCT');
    expect(result.entities.query).toBe('zapatillas nike');
  });
});

// search-catalog.flow.spec.ts
describe('SearchCatalogFlow', () => {
  it('should return products for valid query', async () => {
    mockCatalogService.searchProducts.mockResolvedValue([mockProduct]);
    const result = await flow.handle(mockInput);
    expect(result.response).toContain('Encontré estos productos');
  });
});
```

#### Test e2e crítico:
```typescript
// conversation.e2e-spec.ts
describe('End-to-end conversation', () => {
  it('should process search message and respond', async () => {
    const payload = {
      message_id: 'test-search-123',
      from: '+573001234567',
      text: 'busco camisas',
      timestamp: new Date().toISOString()
    };
    
    // Mock outbound service
    const sendSpy = jest.spyOn(outboundService, 'sendTextMessage');
    
    await request(app.getHttpServer())
      .post('/webhooks/whatsapp/inbound')
      .send(payload)
      .expect(200);
    
    // Verify response was sent
    expect(sendSpy).toHaveBeenCalledWith(
      '+573001234567',
      expect.stringContaining('Encontré estos productos')
    );
  });
});
```

---

### Paso 8: Validación y Deploy
**Duración estimada:** 4 horas  
**Riesgo:** Medio (integración)

#### Checklist de validación:
- [ ] `pnpm lint` pasa
- [ ] `pnpm test` pasa (incluyendo nuevos tests)
- [ ] Test manual con webhook real
- [ ] Verificar rate limiting no bloquea
- [ ] Logs estructurados funcionando
- [ ] Manejo de errores robusto

---

## ⚠️ Riesgos Principales y Mitigaciones

| Riesgo | Impacto | Probabilidad | Mitigación |
|--------|---------|--------------|------------|
| **Rate limit WhatsApp** | Alto | Media | Implementar rate limiter, retry con backoff |
| **Token API inválido** | Alto | Baja | Validación en startup, env vars claras |
| **Ciclos infinitos** | Alto | Baja | Timeout en todos los flows, circuit breaker |
| **Logs PII** | Medio | Media | Enmascarar teléfonos en logs |
| **Latencia alta** | Medio | Alta | Timeout configurable, operaciones async |
| **Keywords ambiguos** | Bajo | Alta | Tests exhaustivos, keywords específicos |

---

## 🧪 Estrategia de Testing

### Pirámide de tests:
1. **Unit tests (70%):** Cada service/flow independiente
2. **Integration tests (20%):** Orchestrator completo
3. **E2E tests (10%):** Webhook → respuesta

### Test data requerido:
- Merchant de prueba con productos
- Tokens de WhatsApp en modo sandbox
- Keywords de test bien definidos

---

## 📈 Métricas de Éxito

| Métrica | Target | Medición |
|---------|--------|----------|
| Primera respuesta | < 3s | Logs timestamped |
| Rate de respuesta | > 95% | Webhook success rate |
| Intent accuracy | > 80% | Manual validation |
| Tests coverage | > 85% | Coverage report |

---

## 🚀 Orden de Implementación Recomendado

1. **Día 1:** Pasos 1-2 (Outbound + Intent Router)
2. **Día 2:** Paso 3 (Flow handlers)  
3. **Día 3:** Paso 4 (Orchestrator)
4. **Día 4:** Pasos 5-6 (Integration + Config)
5. **Día 5:** Pasos 7-8 (Tests + Validation)

**Tiempo total estimado:** 35 horas (5 días)

---

## 🔧 Comandos de Desarrollo

```bash
# Setup inicial
pnpm install
pnpm db:generate

# Desarrollo
pnpm dev

# Testing durante desarrollo
pnpm test --watch
pnpm test:e2e

# Validación final
pnpm lint
pnpm test
pnpm build

# Test manual webhook
curl -X POST http://localhost:3000/webhooks/whatsapp/inbound \
  -H "Content-Type: application/json" \
  -d '{"message_id":"test-123","from":"+573001234567","timestamp":"2026-02-13T10:00:00Z","text":"busco camisas"}'
```