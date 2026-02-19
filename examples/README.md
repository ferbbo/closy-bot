# 📦 Catálogo y Playbooks - Guía de Uso

Esta carpeta contiene ejemplos y templates para configurar tu tienda.

---

## 🏪 Catálogo de Productos

### Opción 1: Usar datos de prueba (seed)

El proyecto incluye un seed con productos de ejemplo listos para usar:

```bash
# Cargar datos de prueba completos (merchant + customers + catálogo)
pnpm db:seed
```

**Esto crea:**
- 1 merchant de prueba: "Dev Test Store"
- 2 clientes de ejemplo
- 3 categorías: Ropa, Belleza, Minimarket
- 5 productos con variantes y stock

### Opción 2: Importar desde CSV

El sistema soporta importación masiva via CSV.

#### Formato del CSV

Usa el template: [`catalog-template.csv`](./catalog-template.csv)

**Columnas requeridas:**
- `name` - Nombre del producto
- `category` - Categoría (se crea automáticamente si no existe)
- `sku` - SKU único (para idempotencia)
- `price` - Precio en centavos o unidad monetaria (sin símbolos)
- `stock` - Cantidad disponible

**Columnas opcionales:**
- `description` - Descripción del producto

#### Cómo importar

**Vía API (próximamente en PR-04+):**
```bash
curl -X POST http://localhost:3000/api/catalog/import \
  -H "Authorization: Bearer sk_test_dev_merchant_001" \
  -H "Content-Type: text/csv" \
  --data-binary @examples/catalog-template.csv
```

**Por ahora (MVP):**  
El servicio `ImportService` está implementado pero no expuesto como endpoint HTTP. Se ejecuta internamente o via CLI.

Puedes invocar el servicio directamente en tests o crear un script temporal:

```typescript
// scripts/import-catalog.ts
import { ImportService } from './apps/api/src/services/import.service';
import * as fs from 'fs';

const csvContent = fs.readFileSync('./examples/catalog-template.csv', 'utf-8');
const merchantId = 'tu-merchant-id';

const result = await importService.importFromCSV(merchantId, csvContent);
console.log(`✅ Importados: ${result.created} productos`);
```

---

## 🎨 Playbooks por Industria

### ¿Qué son los playbooks?

Los playbooks son configuraciones por industria que modifican el tono, preguntas y estrategia del bot:

| Industria | Tono | Foco |
|-----------|------|------|
| **Ropa** | Fashion-forward, inspiracional | Estilo, tallas, combinaciones |
| **Belleza** | Confiable, empático | Tipo de piel, ingredientes, rutinas |
| **Minimarket** | Eficiente, directo | Rapidez, disponibilidad, entregas |

### Playbooks incluidos (PR-11 ✅)

Ya existen 3 playbooks por defecto:

```
apps/api/src/llm/prompts/industry-defaults/
├── ropa.ts          # Fashion/moda
├── belleza.ts       # Cosméticos/cuidado personal
└── minimarket.ts    # Abarrotes/conveniencia
```

### Crear merchants con playbooks

**Opción 1: Seed de playbooks**

```bash
pnpm db:seed:playbooks
```

Esto crea 3 merchants de demo, uno por cada industria:
- Fashion Store Demo (ropa) - `+573001111111`
- Beauty Corner Demo (belleza) - `+573002222222`
- Minimarket Express Demo (minimarket) - `+573003333333`

**Opción 2: Configurar manualmente en la DB**

```sql
-- Asignar industria a un merchant existente
UPDATE "Merchant"
SET industry = 'ropa'  -- o 'belleza', 'minimarket'
WHERE id = 'tu-merchant-id';
```

**Opción 3: Via Prisma Client (código)**

```typescript
await prisma.merchant.update({
  where: { id: 'merchant-id' },
  data: { industry: 'belleza' }
});
```

---

## 🔧 Playbooks Personalizados (Custom)

### Nivel 1: Modificar playbooks existentes

Edita directamente los archivos de industria:

```typescript
// apps/api/src/llm/prompts/industry-defaults/ropa.ts

export const ROPA_PLAYBOOK_STUB = `
Eres un asesor de moda experto y amigable.

**Tu misión:** Ayudar al cliente a encontrar el outfit perfecto.

**Preguntas clave:**
- ¿Para qué ocasión es? (casual, formal, fiesta)
- ¿Qué tallas usas normalmente?
- ¿Tienes preferencias de color?

**Estrategia de venta:**
1. Sugerir combinaciones (tops + bottoms)
2. Resaltar tendencias de temporada
3. Ofrecer descuentos en combos

**Tono:** Inspiracional, fashion-forward, usa emojis de moda 👗✨
`;
```

### Nivel 2: Playbook específico por merchant (Base de datos)

Puedes almacenar configuración custom en el campo `playbookConfig` del merchant:

```typescript
await prisma.merchant.update({
  where: { id: 'merchant-id' },
  data: {
    industry: 'ropa',
    playbookConfig: {
      // JSON custom
      customGreeting: "¡Bienvenido a Fashion Boutique! 👗",
      customGuidelines: [
        "Siempre preguntar presupuesto antes de recomendar",
        "Ofrecer envío gratis en compras >$100mil",
        "Mencionar programa de fidelidad en primera compra"
      ],
      requiredFields: ["talla", "color_preferido"],
      upsellRules: {
        minCartValue: 50000,
        suggestAccessories: true
      }
    }
  }
});
```

El `PlaybookService` ya está preparado para leer y componer estos prompts:

```typescript
// apps/api/src/services/playbook.service.ts
const prompt = await playbookService.buildPromptForMerchant(merchant);
// Combina: base + industria + custom config
```

### Nivel 3: Playbooks Custom vía API (PR-15 ✅)

Con PR-15, puedes configurar playbooks completos directamente desde la API usando DTOs estructurados:

#### Archivos de ejemplo incluidos

```bash
examples/
├── playbook-ropa-custom.json
├── playbook-belleza-custom.json
└── playbook-minimarket-custom.json
```

#### Estructura del DTO

```typescript
{
  industry: 'ropa' | 'belleza' | 'minimarket',
  llmPrompt: {
    tone: string,                    // Personalidad del bot
    focusAreas: string[],            // Aspectos clave a preguntar
    commonQuestions: string[],       // Preguntas frecuentes
    upsellStrategy: string,          // Estrategia de recomendaciones
    emojiUsage: 'none' | 'moderate' | 'frequent'
  },
  messages: {
    greeting: string,                // Saludo inicial
    addToCartConfirm: string,        // Confirmación de agregar
    noStock: string,                 // Sin stock
    upsellTemplate: string,          // Usa placeholder {product}
    checkoutStart: string            // Inicio checkout
  },
  rules: {
    askSizeBeforeCart: boolean,      // Preguntar talla (ropa)
    askSkinTypeOnSearch: boolean,    // Preguntar tipo piel (belleza)
    autoSubstitutions: boolean,      // Sustituciones (minimarket)
    upsellEnabled: boolean,
    maxRecommendations: number       // 0-10
  },
  checkoutQuestions: string[]        // Preguntas adicionales en checkout
}
```

#### Cómo usar

**1. Reemplazar configuración completa (PUT)**

```bash
curl -X PUT http://localhost:3000/merchants/me/playbook \
  -H "Cookie: session_id=<tu-session-id>" \
  -H "Content-Type: application/json" \
  -d @examples/playbook-ropa-custom.json
```

**2. Actualizar solo algunos campos (PATCH)**

```bash
# Solo cambiar el tono
curl -X PATCH http://localhost:3000/merchants/me/playbook \
  -H "Cookie: session_id=<tu-session-id>" \
  -H "Content-Type: application/json" \
  -d '{
    "llmPrompt": {
      "tone": "Eres super casual y usas mucho slang 😎"
    }
  }'

# Solo cambiar mensaje de saludo
curl -X PATCH http://localhost:3000/merchants/me/playbook \
  -H "Cookie: session_id=<tu-session-id>" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": {
      "greeting": "¡Qué onda! 🤙 ¿En qué te ayudo?"
    }
  }'
```

**3. Ver configuración actual**

```bash
curl -X GET http://localhost:3000/merchants/me \
  -H "Cookie: session_id=<tu-session-id>" \
  | jq '.playbookConfig'
```

#### Tips de configuración

- **Tone**: Define personalidad completa en 2-3 oraciones claras
- **focusAreas**: Lista 3-5 aspectos que el bot debe preguntar/mencionar siempre
- **upsellStrategy**: Ser específico sobre cuándo y qué recomendar
- **messages**: Usar placeholders `{merchant_name}` y `{product}` donde aplique
- **rules**: Combinar según industria (ej: ropa = askSizeBeforeCart + upsellEnabled)
- **checkoutQuestions**: Preguntas específicas de tu negocio (horario, dirección, etc.)

#### Ejemplos por industria

**Ropa:**
- `askSizeBeforeCart: true` - Siempre preguntar talla antes de agregar
- `upsellEnabled: true` - Sugerir accesorios complementarios
- `maxRecommendations: 3` - Hasta 3 sugerencias

**Belleza:**
- `askSkinTypeOnSearch: true` - Preguntar tipo de piel al buscar
- `upsellEnabled: true` - Sugerir rutina completa
- `maxRecommendations: 2` - Máximo 2 productos complementarios

**Minimarket:**
- `autoSubstitutions: true` - Ofrecer automáticamente sustitutos si no hay stock
- `upsellEnabled: true` - Recordar productos comúnmente olvidados
- `checkoutQuestions: ["¿Horario de entrega?"]` - Preguntar horario preferido

Ver guía completa: [BACKEND-EXECUTION-GUIDE.md](../docs/BACKEND-EXECUTION-GUIDE.md) → Flujo 4

### Nivel 4: Sistema de plantillas avanzado (futuro)

Para gestión visual de playbooks, considera (post-MVP):
- Admin UI para editar system prompts
- Versionado de playbooks
- A/B testing de tonos
- Editor de flujos condicionales

---

## 🧪 Testing

### Probar catálogo

```bash
# 1. Seed datos
pnpm db:seed

# 2. Enviar mensaje de WhatsApp al número configurado:
"Busco camisa"

# El bot responderá con productos del catálogo
```

### Probar playbooks

```bash
# 1. Seed playbooks
pnpm db:seed:playbooks

# 2. Configurar LLM (si quieres respuestas naturales)
# En .env:
LLM_ENABLED=true
GROQ_API_KEY=tu_api_key

# 3. Enviar mensajes a cada merchant:
# +573001111111 → Fashion tono
# +573002222222 → Beauty tono
# +573003333333 → Minimarket tono
```

### Ver datos en base de datos

```bash
# Abrir Prisma Studio (GUI visual)
pnpm db:studio
```

---

## 📚 Referencias

- [Servicio de Import](../apps/api/src/services/import.service.ts) - Lógica de importación CSV
- [Catalog Service](../apps/api/src/services/catalog.service.ts) - Búsqueda y filtros
- [Playbook Service](../apps/api/src/services/playbook.service.ts) - Composición de prompts
- [Industry Defaults](../apps/api/src/llm/prompts/industry-defaults/) - Playbooks por defecto
- [PR-03 Brief](../docs/plan/pr-briefs/PR-03-catalogo-import-csv-busqueda-simple.md)
- [PR-11 Brief](../docs/plan/pr-briefs/PR-11-playbooks-ropa-belleza-minimarket.md)

---

## ❓ FAQs

### ¿Puedo tener múltiples categorías?

Sí, el sistema soporta categorías ilimitadas. Se crean automáticamente al importar CSV si no existen.

### ¿Los precios incluyen IVA?

Depende de tu configuración. El sistema guarda precios como `Decimal`. Puedes:
- Incluir IVA en el precio CSV
- Calcular IVA dinámicamente en checkout (próximo PR-05)

### ¿Puedo usar mi propio CSV con más columnas?

Para agregar columnas custom (ej: `peso`, `marca`), necesitas:
1. Modificar schema Prisma (`Product` model)
2. Ejecutar migración
3. Actualizar `ImportService` para parsear nuevas columnas

### ¿Cómo actualizo stock sin duplicar productos?

El import es idempotente por `SKU`. Si importas un CSV con el mismo SKU, actualiza en lugar de crear duplicado.

```csv
name,category,sku,price,stock
Camisa Blanca,Ropa,CAM-BLAN-001,35000,50  ← Stock actualizado de 20 a 50
```

### ¿Puedo crear playbooks en otros idiomas?

Sí, el sistema es agnóstico al idioma. Solo edita los archivos de industry defaults o `playbookConfig` JSON con texto en tu idioma.

