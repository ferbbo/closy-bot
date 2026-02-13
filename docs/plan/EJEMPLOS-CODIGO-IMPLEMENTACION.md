# Ejemplos de Código - Plan de Implementación

> **Complemento al plan principal**  
> Código específico y diagramas para implementar conversación end-to-end

---

## 🔧 Código Base por Componente

### 1. WhatsApp Outbound Service

```typescript
// apps/api/src/channels/whatsapp/whatsapp-outbound.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

export interface SendMessageResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

@Injectable()
export class WhatsAppOutboundService {
  private readonly logger = new Logger(WhatsAppOutboundService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {}

  async sendTextMessage(to: string, text: string): Promise<SendMessageResult> {
    const normalizedPhone = this.normalizePhone(to);
    this.logger.log(`Sending message to ${this.maskPhone(normalizedPhone)}`);

    const payload = {
      messaging_product: 'whatsapp',
      to: normalizedPhone,
      type: 'text',
      text: { body: text },
    };

    try {
      const response$ = this.httpService.post(
        `${this.getApiUrl()}/messages`,
        payload,
        {
          headers: this.getHeaders(),
          timeout: 10000,
        },
      );

      const response = await firstValueFrom(response$);
      
      this.logger.log(`Message sent successfully: ${response.data.messages[0].id}`);
      
      return {
        success: true,
        messageId: response.data.messages[0].id,
      };
    } catch (error) {
      this.logger.error(`Failed to send message: ${error.message}`);
      
      // Handle specific WhatsApp errors
      if (error.response?.status === 429) {
        return { success: false, error: 'Rate limit exceeded' };
      }
      
      return { success: false, error: error.message };
    }
  }

  private getApiUrl(): string {
    const version = this.configService.get('WHATSAPP_API_VERSION', 'v18.0');
    const phoneNumberId = this.configService.get('WHATSAPP_PHONE_NUMBER_ID');
    return `https://graph.facebook.com/${version}/${phoneNumberId}`;
  }

  private getHeaders() {
    return {
      'Authorization': `Bearer ${this.configService.get('WHATSAPP_ACCESS_TOKEN')}`,
      'Content-Type': 'application/json',
    };
  }

  private normalizePhone(phone: string): string {
    // Remove all non-digits and ensure format
    let normalized = phone.replace(/\D/g, '');
    
    // Add country code if missing (assuming Colombia +57 for MVP)
    if (!normalized.startsWith('57') && normalized.length === 10) {
      normalized = '57' + normalized;
    }
    
    return normalized;
  }

  private maskPhone(phone: string): string {
    if (phone.length <= 4) return '****';
    return phone.slice(0, 4) + '****' + phone.slice(-4);
  }
}
```

### 2. Intent Router

```typescript
// apps/api/src/orchestrator/intent/intent-router.service.ts
import { Injectable } from '@nestjs/common';

export type IntentType = 'SEARCH_PRODUCT' | 'GREETING' | 'HELP' | 'UNKNOWN';

export interface IntentResult {
  intent: IntentType;
  confidence: number;
  entities?: {
    query?: string;
  };
}

@Injectable()
export class IntentRouterService {
  private readonly searchKeywords = [
    'busco', 'buscar', 'quiero', 'necesito', 'tienes',
    'producto', 'productos', 'vender', 'comprar',
  ];

  private readonly greetingKeywords = [
    'hola', 'buenos', 'buenas', 'saludos', 'hey',
    'qué tal', 'cómo está', 'buen día',
  ];

  private readonly helpKeywords = [
    'ayuda', 'help', 'cómo', 'qué puedes', 'opciones',
    'menú', 'menu', 'información',
  ];

  classify(text: string): IntentResult {
    const normalizedText = this.normalizeText(text);

    // Check for search intent
    if (this.hasKeywords(normalizedText, this.searchKeywords)) {
      return {
        intent: 'SEARCH_PRODUCT',
        confidence: 0.9,
        entities: {
          query: this.extractSearchQuery(normalizedText, text),
        },
      };
    }

    // Check for greeting intent
    if (this.hasKeywords(normalizedText, this.greetingKeywords)) {
      return {
        intent: 'GREETING',
        confidence: 0.85,
      };
    }

    // Check for help intent
    if (this.hasKeywords(normalizedText, this.helpKeywords)) {
      return {
        intent: 'HELP',
        confidence: 0.8,
      };
    }

    // Default to unknown
    return {
      intent: 'UNKNOWN',
      confidence: 0.3,
    };
  }

  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/[áàäâ]/g, 'a')
      .replace(/[éèëê]/g, 'e')
      .replace(/[íìïî]/g, 'i')
      .replace(/[óòöô]/g, 'o')
      .replace(/[úùüû]/g, 'u')
      .replace(/ñ/g, 'n');
  }

  private hasKeywords(text: string, keywords: string[]): boolean {
    return keywords.some((keyword) => text.includes(keyword));
  }

  private extractSearchQuery(normalizedText: string, originalText: string): string {
    // Try to extract query after search keywords
    for (const keyword of this.searchKeywords) {
      const index = normalizedText.indexOf(keyword);
      if (index !== -1) {
        const afterKeyword = originalText
          .substring(index + keyword.length)
          .trim()
          .replace(/^(un|una|de|el|la|los|las)\s+/i, ''); // Remove articles
        
        if (afterKeyword) {
          return afterKeyword;
        }
      }
    }

    // Fallback: return cleaned original text
    return originalText.replace(new RegExp(`(${this.searchKeywords.join('|')})`, 'gi'), '').trim();
  }
}
```

### 3. Search Catalog Flow

```typescript
// apps/api/src/orchestrator/flows/search-catalog.flow.ts
import { Injectable, Logger } from '@nestjs/common';
import { CatalogService, ProductWithVariants } from '../../services/catalog.service';

interface FlowInput {
  merchantId: string;
  customerId: string;
  conversationId: string;
  intent: string;
  entities: Record<string, any>;
  text: string;
}

interface FlowResult {
  response: string;
  shouldContinue: boolean;
  metadata?: Record<string, any>;
}

@Injectable()
export class SearchCatalogFlow {
  private readonly logger = new Logger(SearchCatalogFlow.name);

  constructor(private readonly catalogService: CatalogService) {}

  async handle(input: FlowInput): Promise<FlowResult> {
    const { merchantId, entities } = input;
    const query = entities.query?.trim();

    this.logger.log(`Search catalog flow: query="${query}", merchant=${merchantId}`);

    // Validate query
    if (!query || query.length < 2) {
      return {
        response: this.getQueryHelp(),
        shouldContinue: true,
      };
    }

    try {
      // Search products
      const products = await this.catalogService.searchProducts(
        merchantId,
        query,
        5, // limit results
      );

      if (products.length === 0) {
        return {
          response: this.getNoResultsMessage(query),
          shouldContinue: true,
        };
      }

      // Format response
      const response = this.formatProductResults(query, products);
      
      return {
        response,
        shouldContinue: true,
        metadata: {
          searchQuery: query,
          foundProducts: products.length,
          productIds: products.map(p => p.id),
        },
      };
    } catch (error) {
      this.logger.error(`Error searching catalog: ${error.message}`);
      
      return {
        response: 'Disculpa, tuve un problema al buscar productos. ¿Podrías intentar de nuevo?',
        shouldContinue: true,
      };
    }
  }

  private formatProductResults(query: string, products: ProductWithVariants[]): string {
    const header = `🔍 Encontré ${products.length} producto${products.length > 1 ? 's' : ''} para "${query}":\n\n`;
    
    const productList = products
      .map((product, index) => {
        const variant = product.variants[0]; // Use first variant
        const price = variant?.price ? `$${variant.price.toLocaleString()}` : 'Precio no disponible';
        const stock = variant?.stock > 0 ? '✅ Disponible' : '❌ Agotado';
        
        return `${index + 1}. **${product.name}**\n   ${price} | ${stock}`;
      })
      .join('\n\n');
    
    const footer = '\n\n💬 ¿Te interesa alguno? Puedes decirme el número o seguir buscando.';
    
    return header + productList + footer;
  }

  private getQueryHelp(): string {
    return [
      '🔍 **¿Qué estás buscando?**',
      '',
      'Puedes decirme cosas como:',
      '• "busco camisas"',
      '• "quiero zapatillas nike"',
      '• "tienes pantalones de jean"',
      '',
      '¿Qué te gustaría encontrar?',
    ].join('\n');
  }

  private getNoResultsMessage(query: string): string {
    return [
      `😔 No encontré productos que coincidan con "${query}".`,
      '',
      '💡 **Sugerencias:**',
      '• Intenta con términos más generales',
      '• Revisa la ortografía',
      '• Pregúntame qué categorías tengo disponibles',
      '',
      '¿Quieres intentar otra búsqueda?',
    ].join('\n');
  }
}
```

### 4. Greeting Flow

```typescript
// apps/api/src/orchestrator/flows/greeting.flow.ts
import { Injectable } from '@nestjs/common';

@Injectable()
export class GreetingFlow {
  async handle(input: FlowInput): Promise<FlowResult> {
    const greeting = this.getTimeBasedGreeting();
    
    const response = [
      `${greeting} 👋`,
      '',
      '¡Bienvenido a nuestra tienda virtual!',
      '',
      '🛍️ **¿En qué te puedo ayudar hoy?**',
      '',
      '• Buscar productos: "busco camisas"',
      '• Ver catálogo completo: "qué tienes"',
      '• Obtener ayuda: "ayuda"',
      '',
      'Solo escribe lo que necesitas y te ayudo a encontrarlo.',
    ].join('\n');

    return {
      response,
      shouldContinue: true,
      metadata: { flow: 'greeting' },
    };
  }

  private getTimeBasedGreeting(): string {
    const hour = new Date().getHours();
    
    if (hour < 12) return '¡Buenos días!';
    if (hour < 18) return '¡Buenas tardes!';
    return '¡Buenas noches!';
  }
}
```

---

## 📊 Diagrama de Flujo

```mermaid
graph TB
    A[WhatsApp Webhook] --> B[WhatsApp Controller]
    B --> C[Dedupe + Persist]
    C --> D{Duplicate?}
    D -->|Yes| E[Return 200 + duplicate flag]
    D -->|No| F[Conversation Orchestrator]
    
    F --> G[Resolve Merchant]
    F --> H[Resolve Customer]
    F --> I[Get/Create Conversation]
    F --> J[Intent Router]
    
    J --> K{Intent Type?}
    K -->|SEARCH_PRODUCT| L[Search Catalog Flow]
    K -->|GREETING| M[Greeting Flow]
    K -->|HELP| N[Help Flow]
    K -->|UNKNOWN| O[Default Response]
    
    L --> P[Catalog Service]
    P --> Q[Format Results]
    Q --> R[WhatsApp Outbound Service]
    
    M --> R
    N --> R
    O --> R
    
    R --> S[Send Response to User]
    S --> T[Return 200 OK]
```

---

## 🧪 Test Examples

### Unit Test - Intent Router

```typescript
// apps/api/src/orchestrator/intent/intent-router.service.spec.ts
describe('IntentRouterService', () => {
  let service: IntentRouterService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [IntentRouterService],
    }).compile();

    service = module.get<IntentRouterService>(IntentRouterService);
  });

  describe('classify', () => {
    it('should classify search product intent', () => {
      const tests = [
        { input: 'busco zapatillas nike', expectedQuery: 'zapatillas nike' },
        { input: 'quiero camisas azules', expectedQuery: 'camisas azules' },
        { input: 'tienes pantalones?', expectedQuery: 'pantalones?' },
        { input: 'necesito un producto para deporte', expectedQuery: 'un producto para deporte' },
      ];

      tests.forEach(({ input, expectedQuery }) => {
        const result = service.classify(input);
        expect(result.intent).toBe('SEARCH_PRODUCT');
        expect(result.confidence).toBeGreaterThan(0.8);
        expect(result.entities.query).toBe(expectedQuery);
      });
    });

    it('should classify greeting intent', () => {
      const greetings = ['hola', 'buenos días', 'buenas tardes', 'hey', 'qué tal'];

      greetings.forEach(greeting => {
        const result = service.classify(greeting);
        expect(result.intent).toBe('GREETING');
        expect(result.confidence).toBeGreaterThan(0.7);
      });
    });

    it('should classify help intent', () => {
      const helpTexts = ['ayuda', 'qué puedes hacer', 'opciones', 'menú'];

      helpTexts.forEach(text => {
        const result = service.classify(text);
        expect(result.intent).toBe('HELP');
        expect(result.confidence).toBeGreaterThan(0.7);
      });
    });

    it('should return UNKNOWN for unrecognized texts', () => {
      const unknownTexts = ['abc123', 'random text', '!!!'];

      unknownTexts.forEach(text => {
        const result = service.classify(text);
        expect(result.intent).toBe('UNKNOWN');
        expect(result.confidence).toBeLessThan(0.5);
      });
    });
  });
});
```

### Integration Test - Full Flow

```typescript
// apps/api/test/conversation-flow.e2e-spec.ts
describe('Conversation Flow (e2e)', () => {
  let app: INestApplication;
  let outboundService: WhatsAppOutboundService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Apply middleware...
    await app.init();

    outboundService = app.get<WhatsAppOutboundService>(WhatsAppOutboundService);
  });

  it('should handle greeting conversation flow', async () => {
    const sendMessageSpy = jest.spyOn(outboundService, 'sendTextMessage')
      .mockResolvedValue({ success: true, messageId: 'mock_id' });

    const payload = {
      message_id: 'test-greeting-123',
      from: '+573001234567',
      text: 'hola',
      timestamp: new Date().toISOString(),
    };

    const response = await request(app.getHttpServer())
      .post('/webhooks/whatsapp/inbound')
      .send(payload)
      .expect(200);

    expect(response.body.processed).toBe(true);
    expect(sendMessageSpy).toHaveBeenCalledWith(
      '+573001234567',
      expect.stringContaining('Bienvenido')
    );
  });

  it('should handle product search conversation flow', async () => {
    // Setup test data
    await seedTestProducts();

    const sendMessageSpy = jest.spyOn(outboundService, 'sendTextMessage')
      .mockResolvedValue({ success: true, messageId: 'mock_id' });

    const payload = {
      message_id: 'test-search-456',
      from: '+573001234567',
      text: 'busco camisas',
      timestamp: new Date().toISOString(),
    };

    await request(app.getHttpServer())
      .post('/webhooks/whatsapp/inbound')
      .send(payload)
      .expect(200);

    expect(sendMessageSpy).toHaveBeenCalledWith(
      '+573001234567',
      expect.stringContaining('Encontré')
    );
  });

  it('should not send duplicate responses', async () => {
    const sendMessageSpy = jest.spyOn(outboundService, 'sendTextMessage')
      .mockResolvedValue({ success: true, messageId: 'mock_id' });

    const payload = {
      message_id: 'test-duplicate-789',
      from: '+573001234567',
      text: 'hola',
      timestamp: new Date().toISOString(),
    };

    // First request
    await request(app.getHttpServer())
      .post('/webhooks/whatsapp/inbound')
      .send(payload)
      .expect(200);

    // Second request (duplicate)
    const duplicateResponse = await request(app.getHttpServer())
      .post('/webhooks/whatsapp/inbound')
      .send(payload)
      .expect(200);

    expect(duplicateResponse.body.duplicate).toBe(true);
    expect(sendMessageSpy).toHaveBeenCalledTimes(1); // Only once
  });
});
```

---

## 🔧 Configuración de Desarrollo

### .env.example actualizado

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/closy_bot"

# App
NODE_ENV=development
PORT=3000
LOG_LEVEL=info

# WhatsApp Integration
WHATSAPP_ACCESS_TOKEN=your_access_token_here
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id_here
WHATSAPP_API_VERSION=v18.0
WHATSAPP_API_URL=https://graph.facebook.com

# Development flags
DRY_RUN_OUTBOUND=false  # Set to true to avoid sending real messages in dev
```

### Comandos útiles para desarrollo

```bash
# Test specific components
pnpm test intent-router
pnpm test search-catalog
pnpm test conversation

# Test webhook manually
curl -X POST http://localhost:3000/webhooks/whatsapp/inbound \
  -H "Content-Type: application/json" \
  -d '{
    "message_id": "test-manual-001",
    "from": "+573001234567",
    "text": "busco zapatillas",
    "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)'"
  }'

# Monitor logs during development
pnpm dev | grep -E "conversation_id|intent|outbound"
```