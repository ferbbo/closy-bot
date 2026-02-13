# PR Brief — PR-04 — Carrito: CRUD conversacional persistido

> Archivo: `docs/plan/pr-briefs/PR-04-carrito-crud-conversacional.md`
> 
> Regla: 1 página. Machine-actionable. Sin scope extra.

## Objetivo

Implementar carrito de compras persistido con operaciones CRUD por conversation/customer, permitiendo agregar/remover productos y mostrar resumen antes del checkout.

## Scope fence

### ✅ Included

- Modelos `Cart` y `CartItem` con relaciones a `Customer` y `Product`
- Servicios para crear/obtener carrito por conversación
- Operaciones: agregar producto, remover item, actualizar cantidad, vaciar carrito
- Validaciones de stock y disponibilidad
- Cálculos de subtotal y totales

### ❌ Excluded

- Proceso de checkout (PR-05)
- Descuentos y promociones
- Carritos compartidos/múltiples
- Persistencia de carritos por tiempo indefinido

## Paths a tocar (concretos)

- `prisma/schema.prisma` — modelos Cart/CartItem
- `src/domain/entities/cart.entity.ts` — entidad carrito
- `src/domain/entities/cart-item.entity.ts` — entidad item de carrito
- `src/persistence/repositories/cart.repository.ts` — repo carrito
- `src/services/cart.service.ts` — lógica de negocio del carrito
- `src/services/cart.service.spec.ts` — tests del servicio
- `apps/api/src/orchestrator/` — integración con flows conversacionales

## Contratos / Interfaces

- Endpoints (si aplica):
  - `POST /internal/cart/add-item` — agregar producto al carrito
  - `PUT /internal/cart/item/:id/quantity` — actualizar cantidad
  - `DELETE /internal/cart/item/:id` — remover item
  - `GET /internal/cart/:conversationId` — obtener carrito actual
- DTOs / payloads:
  - `AddToCartDto` — { conversationId, productId, variantId?, quantity }
  - `UpdateCartItemDto` — { quantity }
  - `CartSummaryDto` — { items[], subtotal, total, itemCount }
- Persistencia (Prisma/models):
  - `Cart` { id, customerId, conversationId, createdAt, updatedAt }
  - `CartItem` { id, cartId, productId, variantId?, quantity, unitPrice, createdAt }
- Idempotencia (si aplica):
  - Key: combinación (cartId, productId, variantId) para evitar duplicados
  - Constraint unique: cart_items_unique_product_per_cart

## Comportamiento

- Happy path:
  - Customer agrega producto → se crea carrito si no existe → se agrega/actualiza item
  - Customer ve resumen → muestra items con precios actuales y total
  - Customer modifica cantidad → actualiza item existente
  - Customer remueve item → elimina de carrito
- Edge cases:
  - Producto fuera de stock → error con mensaje claro
  - Carrito vacío → respuesta apropiada sin error
  - Producto ya en carrito → actualizar cantidad (suma o reemplaza según lógica)
  - Precio cambió desde agregado → usar precio actual con notificación

## Acceptance criteria (verificables)

- [ ] Carrito se crea automáticamente por conversación la primera vez
- [ ] Agregar producto actualiza quantity si ya existe en carrito
- [ ] Remover item elimina completamente del carrito
- [ ] Cálculos de totales son correctos y usan precios actuales
- [ ] Validación de stock antes de agregar/actualizar quantity
- [ ] Tests cubren casos de carrito vacío, items duplicados y validaciones
- [ ] API interna funciona correctamente con DTOs tipados

## Comandos para validar

- `pnpm lint`
- `pnpm test`
- `pnpm db:migrate` (nueva migración para Cart/CartItem)
- `pnpm test src/services/cart.service.spec.ts`

## Riesgos y mitigaciones

- **Precios desactualizados:** Siempre usar precio actual del catálogo, notificar cambios
- **Stock insuficiente:** Validar disponibilidad antes de confirmar operación
- **Carritos huérfanos:** Implementar TTL o clean-up periódico (fuera de scope V1)

## Notas

- Guardrails: el bot NO inventa precio/stock/políticas/ETA.
- PII: minimizar y evitar logs con datos sensibles.
- Dependencia: requiere PR-03 (catálogo) completado para validaciones de productos.