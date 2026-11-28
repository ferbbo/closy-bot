import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Seed demo del Closy Delivery Agent (S1.1-T5).
 *
 * Comercio "Burger Barrio" (industry=restaurante) con 4 categorías, 14 productos,
 * 3 zonas de domicilio (Bucaramanga) y medios de pago. Es idempotente (upserts con ids
 * estables `dlv_*`). Todos los datos comerciales viven en la BD (RN-00): el agente
 * los lee en cada turno vía herramientas.
 *
 * Uso: pnpm db:seed:delivery
 */

const MERCHANT_ID = 'dlv_merchant_burger_barrio';

interface SeedVariant {
  sku: string;
  name: string;
  price: number;
}
interface SeedProduct {
  id: string;
  name: string;
  description: string;
  tags: string[];
  variants: SeedVariant[];
}

const CATALOG: Record<string, SeedProduct[]> = {
  Hamburguesas: [
    {
      id: 'dlv_hamburguesa_sencilla',
      name: 'Hamburguesa sencilla',
      description: 'Carne de res 150 g, queso, lechuga, tomate, cebolla y salsa de la casa',
      tags: ['hamburguesa', 'burger', 'sencilla'],
      variants: [{ sku: 'HAM-SEN', name: 'Única', price: 16000 }],
    },
    {
      id: 'dlv_hamburguesa_doble',
      name: 'Hamburguesa doble',
      description: 'Doble carne de res, doble queso, lechuga, tomate y cebolla',
      tags: ['hamburguesa', 'burger', 'doble'],
      variants: [{ sku: 'HAM-DOB', name: 'Única', price: 22000 }],
    },
    {
      id: 'dlv_hamburguesa_tocineta',
      name: 'Hamburguesa de tocineta',
      description: 'Carne de res, tocineta crocante, queso cheddar y cebolla caramelizada',
      tags: ['hamburguesa', 'burger', 'tocineta', 'bacon'],
      variants: [{ sku: 'HAM-TOC', name: 'Única', price: 19000 }],
    },
  ],
  Perros: [
    {
      id: 'dlv_perro_sencillo',
      name: 'Perro sencillo',
      description: 'Salchicha americana, papita triturada y salsas',
      tags: ['perro', 'hot dog', 'perro caliente'],
      variants: [{ sku: 'PER-SEN', name: 'Único', price: 12000 }],
    },
    {
      id: 'dlv_perro_especial',
      name: 'Perro especial',
      description: 'Salchicha americana, queso gratinado, tocineta, papita y salsas',
      tags: ['perro', 'hot dog', 'especial'],
      variants: [{ sku: 'PER-ESP', name: 'Único', price: 15000 }],
    },
    {
      id: 'dlv_choriperro',
      name: 'Choriperro',
      description: 'Chorizo santarrosano, queso, papita triturada y salsas',
      tags: ['perro', 'chorizo', 'choriperro'],
      variants: [{ sku: 'PER-CHO', name: 'Único', price: 16000 }],
    },
  ],
  Bebidas: [
    {
      id: 'dlv_coca_cola',
      name: 'Coca-Cola',
      description: 'Gaseosa Coca-Cola',
      tags: ['coca', 'cocacola', 'gaseosa', 'bebida'],
      variants: [
        { sku: 'BEB-COCA-400', name: '400 ml', price: 4000 },
        { sku: 'BEB-COCA-1500', name: '1.5 L', price: 8000 },
      ],
    },
    {
      id: 'dlv_jugo_natural',
      name: 'Jugo natural',
      description: 'Jugo en agua de mora, mango o maracuyá',
      tags: ['jugo', 'bebida', 'natural'],
      variants: [{ sku: 'BEB-JUGO', name: 'Vaso 16 oz', price: 6000 }],
    },
    {
      id: 'dlv_agua',
      name: 'Agua',
      description: 'Agua sin gas',
      tags: ['agua', 'bebida'],
      variants: [{ sku: 'BEB-AGUA', name: '600 ml', price: 3000 }],
    },
    {
      id: 'dlv_malteada',
      name: 'Malteada',
      description: 'Malteada de vainilla, chocolate o fresa',
      tags: ['malteada', 'batido', 'bebida'],
      variants: [{ sku: 'BEB-MALT', name: '12 oz', price: 9000 }],
    },
  ],
  Adiciones: [
    {
      id: 'dlv_papas_fritas',
      name: 'Papas fritas',
      description: 'Porción de papas a la francesa',
      tags: ['papas', 'adicion', 'acompañante'],
      variants: [{ sku: 'ADI-PAPAS', name: 'Porción', price: 6000 }],
    },
    {
      id: 'dlv_tocineta_extra',
      name: 'Tocineta extra',
      description: 'Adición de tocineta',
      tags: ['tocineta', 'adicion', 'extra'],
      variants: [{ sku: 'ADI-TOC', name: 'Porción', price: 3000 }],
    },
    {
      id: 'dlv_queso_extra',
      name: 'Queso extra',
      description: 'Adición de queso',
      tags: ['queso', 'adicion', 'extra'],
      variants: [{ sku: 'ADI-QUESO', name: 'Porción', price: 2500 }],
    },
    {
      id: 'dlv_salsa_casa',
      name: 'Salsa de la casa',
      description: 'Porción adicional de salsa de la casa',
      tags: ['salsa', 'adicion'],
      variants: [{ sku: 'ADI-SALSA', name: 'Porción', price: 1000 }],
    },
  ],
};

const DELIVERY_CONFIG = {
  timezone: 'America/Bogota',
  openingHours: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, open: '11:00', close: '22:00' })),
  temporarilyClosed: false,
  prepTimeMinutes: 25,
  zones: [
    {
      id: 'cabecera',
      name: 'Cabecera',
      aliases: ['cabecera del llano'],
      fee: 4000,
      minOrder: 15000,
      etaMinutes: 20,
    },
    { id: 'provenza', name: 'Provenza', aliases: [], fee: 5000, minOrder: 15000, etaMinutes: 25 },
    {
      id: 'canaveral',
      name: 'Cañaveral',
      aliases: ['canaveral'],
      fee: 6000,
      minOrder: 20000,
      etaMinutes: 30,
    },
  ],
  freeDeliveryAbove: null,
  pickupEnabled: true,
  trackStock: false,
  maxQtyPerLine: 20,
  maxLines: 15,
  maxOrderAmountWithoutHuman: 300000,
  assistantName: null,
  toneHints: 'cercano, rápido, colombiano',
  notifications: {
    mode: 'template_always',
    templateLanguage: 'es',
    maxBusinessInitiatedPerOrder: 6,
  },
  privacyPolicyUrl: 'https://example.com/burger-barrio/privacidad',
  menuImageUrl: null,
  pos: { provider: 'none', enabled: false, settings: {}, secretRef: null },
};

async function main(): Promise<void> {
  console.log('🍔 Seeding delivery demo (Burger Barrio)...');

  const merchant = await prisma.merchant.upsert({
    where: { id: MERCHANT_ID },
    update: { industry: 'restaurante', status: 'active' },
    create: {
      id: MERCHANT_ID,
      name: 'Burger Barrio',
      whatsappNumber: '+573000000001', // Meta Sandbox: número del encargado (SANDBOX_APP.merchantPhone)
      apiKey: 'sk_test_delivery_burger_barrio',
      industry: 'restaurante',
      status: 'active',
    },
  });

  const configData = {
    paymentMethods: [
      { type: 'cod', label: 'Efectivo contra entrega' },
      {
        type: 'transfer',
        label: 'Transferencia Nequi',
        instructions:
          'Nequi 300 000 0001 a nombre de Burger Barrio SAS. Envía el comprobante por este chat.',
      },
    ] as unknown as Prisma.InputJsonValue,
    shippingConfig: {
      shippingPolicy: 'Domicilios en Cabecera, Provenza y Cañaveral.',
    } as unknown as Prisma.InputJsonValue,
    returnPolicy: null,
    currency: 'COP',
    orderCodePrefix: 'ORD',
    autoConfirmCod: true,
    deliveryConfig: DELIVERY_CONFIG as unknown as Prisma.InputJsonValue,
  };
  await prisma.merchantConfig.upsert({
    where: { merchantId: merchant.id },
    update: configData,
    create: { merchantId: merchant.id, ...configData },
  });

  let products = 0;
  let variants = 0;
  for (const [categoryName, items] of Object.entries(CATALOG)) {
    const category = await prisma.category.upsert({
      where: { merchantId_name: { merchantId: merchant.id, name: categoryName } },
      update: {},
      create: { merchantId: merchant.id, name: categoryName },
    });
    for (const p of items) {
      // Raw PrismaClient has no searchText middleware: build it like product.middleware.ts
      const searchText = [p.name, p.description, p.tags.join(' '), ...p.variants.map((v) => v.name)]
        .join(' ')
        .trim();
      await prisma.product.upsert({
        where: { id: p.id },
        update: {
          name: p.name,
          description: p.description,
          tags: p.tags,
          searchText,
          categoryId: category.id,
          isActive: true,
        },
        create: {
          id: p.id,
          name: p.name,
          description: p.description,
          tags: p.tags,
          searchText,
          categoryId: category.id,
          merchantId: merchant.id,
          isActive: true,
        },
      });
      products++;
      for (const v of p.variants) {
        await prisma.productVariant.upsert({
          where: { productId_sku: { productId: p.id, sku: v.sku } },
          update: { name: v.name, price: v.price, isActive: true },
          create: {
            productId: p.id,
            sku: v.sku,
            name: v.name,
            price: v.price,
            stock: 100,
            isActive: true,
          },
        });
        variants++;
      }
    }
  }

  // DBs created with `db push` have no FTS trigger (migration PR-03.5.2.1): fill the
  // weighted tsvector with the same formula so CatalogService.searchProducts works locally.
  await prisma.$executeRaw`
    UPDATE products SET search_text_weighted =
      setweight(to_tsvector('simple', COALESCE(name, '')), 'A') ||
      setweight(to_tsvector('simple', COALESCE(brand, '')), 'B') ||
      setweight(to_tsvector('simple', array_to_string(COALESCE(tags, '{}'), ' ')), 'C') ||
      setweight(to_tsvector('simple', COALESCE(description, '')), 'D')
    WHERE merchant_id = ${merchant.id}`;

  console.log(
    `✅ Burger Barrio (${merchant.id}): ${Object.keys(CATALOG).length} categorías, ${products} productos, ${variants} variantes, ${DELIVERY_CONFIG.zones.length} zonas`,
  );
}

main()
  .catch((error: unknown) => {
    console.error('❌ Delivery seed failed:', (error as Error).message);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
