# PR Brief — PR-03 — Catálogo: import CSV + búsqueda simple

> Archivo: `docs/plan/pr-briefs/PR-03-catalogo-import-csv-busqueda-simple.md`
> 
> Regla: 1 página. Machine-actionable. Sin scope extra.

## Objetivo

Implementar catálogo de productos con import CSV y búsqueda por texto para que merchants puedan cargar inventario y customers buscar productos disponibles en conversaciones.

## Scope fence

### ✅ Included

- Modelos Prisma: `Product`, `Category`, `ProductVariant` con stock/precio
- Import service que procesa CSV con validaciones básicas
- Búsqueda simple por nombre/descripción (ILIKE/full-text)
- Repositorios y servicios para CRUD de catálogo
- Filtros básicos: por merchant, disponibilidad, categoría
- Endpoints internos para búsqueda desde orquestador

### ❌ Excluded

- Recomendaciones ML/algoritmos inteligentes
- Integraciones Shopify/WooCommerce/APIs externas  
- Sistema de inventario complejo con reservas/lotes
- Imágenes/media management avanzado
- Sincronización en tiempo real con APIs externas
- Dashboard frontend para merchants

## Paths a tocar (concretos)

- `prisma/schema.prisma` - modelos Product, ProductVariant, Category
- `apps/api/src/domain/entities/` - product.entity.ts, category.entity.ts, variant.entity.ts  
- `apps/api/src/persistence/repositories/` - product.repository.ts, category.repository.ts
- `apps/api/src/services/` - catalog.service.ts, import.service.ts
- `apps/api/src/services/services.module.ts` - registrar nuevos servicios
- `apps/api/src/persistence/persistence.module.ts` - registrar repos
- `apps/api/test/` - tests unitarios de repos y servicios
- `prisma/seed.ts` - datos de prueba para productos/categorías

## Contratos / Interfaces

- Persistencia (Prisma/models):
  - `Category`: id, name, merchant_id, created_at, updated_at
  - `Product`: id, name, description, category_id, merchant_id, is_active, created_at, updated_at  
  - `ProductVariant`: id, product_id, sku?, name, price, stock, is_active, created_at, updated_at
- Repositorios:
  - `CategoryRepository`: findByMerchant(), create()
  - `ProductRepository`: search(), findById(), findByMerchant(), create(), update()
- Servicios:
  - `CatalogService`: searchProducts(merchantId, query, limit?), getProduct(id), getByCategory()
  - `ImportService`: importFromCSV(merchantId, csvContent) - valida y crea productos
- CSV formato esperado:
  - Headers: name, description, category, sku, price, stock
  - Validaciones: name required, sku required, price > 0, stock >= 0
- Idempotencia:
  - Key: `productId + sku` para ProductVariant (unique constraint)
  - Import puede re-ejecutarse sin duplicar (upsert por SKU)

## Comportamiento

- Happy path:
  1. Merchant sube CSV con productos
  2. ImportService valida formato y datos  
  3. Crea/actualiza categorías if not exist
  4. Crea/actualiza productos y variantes por SKU
  5. Customer busca "camisa" 
  6. CatalogService.searchProducts() retorna productos activos con stock > 0
  7. Retorna lista ordenada por relevancia básica (nombre exact match primero)
- Edge cases:
  - CSV malformado: retorna errores específicos por fila
  - SKU duplicado en mismo CSV: último valor prevalece (last wins)
  - Búsqueda sin resultados: retorna array vacío
  - Producto sin stock: excluido de búsqueda por defecto
  - Reintentos de import: idempotente por SKU

## Acceptance criteria (verificables)

- [ ] Modelo Product/ProductVariant/Category pueden crear productos con stock/precio
- [ ] ImportService.importFromCSV() procesa CSV válido y crea productos
- [ ] Import es idempotente: re-ejecutar mismo CSV no duplica (upsert por SKU + merchant)
- [ ] CatalogService.searchProducts() busca por texto en nombre/descripción
- [ ] Búsqueda filtra automáticamente por merchant_id (multi-tenancy)
- [ ] Búsqueda solo retorna productos activos con stock > 0 por defecto
- [ ] CSV con errores reporta líneas específicas con problemas
- [ ] Tests cubren import exitoso, errores de validación, búsqueda por texto

## Comandos para validar

- `pnpm lint`
- `pnpm test`
- `pnpm db:migrate`
- `pnpm db:generate`

## Riesgos y mitigaciones

- **Riesgo**: CSV grande puede causar timeout/memory issues
  - **Mitigación**: Procesar en batches de 100-500 productos, validar tamaño de archivo
- **Riesgo**: Búsqueda lenta con muchos productos  
  - **Mitigación**: Índices en name/description, limit por defecto en búsqueda
- **Riesgo**: Precios/stock desactualizados vs realidad del merchant
  - **Mitigación**: Documentar que es responsabilidad del merchant mantener datos actualizados

## Notas

- Guardrails: el bot NO inventa precio/stock/políticas/ETA - siempre consulta CatalogService
- PII: productos pueden contener nombres comerciales pero no datos personales de clientes
- Extensibilidad: modelos preparados para futuras features (imágenes, descuentos, etc.)
- **Migración PROD**: `sku` cambió de `NULL` a `NOT NULL` en `product_variants`. Si hay datos existentes con `sku = NULL`, la migración fallará. Requiere data-fix previo (asignar SKU a variantes sin él) antes de aplicar en producción.