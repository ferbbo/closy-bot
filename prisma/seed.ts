import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Seed script for Core V1 MVP
 * Creates test data for manual testing and development
 */
async function main() {
  console.log('🌱 Seeding database...');

  // Create test merchant
  const merchant = await prisma.merchant.upsert({
    where: { apiKey: 'sk_test_dev_merchant_001' },
    update: {},
    create: {
      name: 'Dev Test Store',
      whatsappNumber: '+573001111111',
      apiKey: 'sk_test_dev_merchant_001',
    },
  });
  console.log('✅ Created merchant:', merchant.id);

  // Create test customers
  const customer1 = await prisma.customer.upsert({
    where: { phone: '+573001234567' },
    update: {},
    create: {
      phone: '+573001234567',
      name: 'Juan Pérez',
      language: 'es',
    },
  });
  console.log('✅ Created customer 1:', customer1.id);

  const customer2 = await prisma.customer.upsert({
    where: { phone: '+573009876543' },
    update: {},
    create: {
      phone: '+573009876543',
      name: 'María González',
      language: 'es',
    },
  });
  console.log('✅ Created customer 2:', customer2.id);

  // Clean up existing test conversations to ensure idempotency
  await prisma.conversation.deleteMany({
    where: {
      merchantId: merchant.id,
      customerId: { in: [customer1.id, customer2.id] },
    },
  });

  // Create test conversations
  const conv1 = await prisma.conversation.create({
    data: {
      customerId: customer1.id,
      merchantId: merchant.id,
      channel: 'whatsapp',
      status: 'active',
      lastMessageAt: new Date(),
    },
  });
  console.log('✅ Created conversation 1:', conv1.id);

  const conv2 = await prisma.conversation.create({
    data: {
      customerId: customer2.id,
      merchantId: merchant.id,
      channel: 'whatsapp',
      status: 'active',
      lastMessageAt: new Date(),
    },
  });
  console.log('✅ Created conversation 2:', conv2.id);

  // PR-03: Create catalog test data
  console.log('\n📦 Creating catalog test data...');

  // Create categories
  const categoryRopa = await prisma.category.upsert({
    where: {
      merchantId_name: {
        merchantId: merchant.id,
        name: 'Ropa',
      },
    },
    update: {},
    create: {
      name: 'Ropa',
      merchantId: merchant.id,
    },
  });
  console.log('✅ Created category: Ropa');

  const categoryBelleza = await prisma.category.upsert({
    where: {
      merchantId_name: {
        merchantId: merchant.id,
        name: 'Belleza',
      },
    },
    update: {},
    create: {
      name: 'Belleza',
      merchantId: merchant.id,
    },
  });
  console.log('✅ Created category: Belleza');

  const categoryMinimarket = await prisma.category.upsert({
    where: {
      merchantId_name: {
        merchantId: merchant.id,
        name: 'Minimarket',
      },
    },
    update: {},
    create: {
      name: 'Minimarket',
      merchantId: merchant.id,
    },
  });
  console.log('✅ Created category: Minimarket');

  // Create products with variants
  // Ropa products
  const camisaAzul = await prisma.product.upsert({
    where: { id: 'product_camisa_azul_test' },
    update: {},
    create: {
      id: 'product_camisa_azul_test',
      name: 'Camisa Azul Clásica',
      description: 'Camisa de algodón 100% de alta calidad',
      categoryId: categoryRopa.id,
      merchantId: merchant.id,
      isActive: true,
      variants: {
        create: [
          {
            sku: 'CAMISA-AZUL-M',
            name: 'Talla M',
            price: 45000,
            stock: 15,
            isActive: true,
          },
          {
            sku: 'CAMISA-AZUL-L',
            name: 'Talla L',
            price: 45000,
            stock: 10,
            isActive: true,
          },
        ],
      },
    },
  });
  console.log('✅ Created product: Camisa Azul Clásica');

  const pantalonNegro = await prisma.product.upsert({
    where: { id: 'product_pantalon_negro_test' },
    update: {},
    create: {
      id: 'product_pantalon_negro_test',
      name: 'Pantalón Negro Casual',
      description: 'Pantalón casual para uso diario',
      categoryId: categoryRopa.id,
      merchantId: merchant.id,
      isActive: true,
      variants: {
        create: [
          {
            sku: 'PANT-NEGRO-32',
            name: 'Talla 32',
            price: 75000,
            stock: 8,
            isActive: true,
          },
          {
            sku: 'PANT-NEGRO-34',
            name: 'Talla 34',
            price: 75000,
            stock: 12,
            isActive: true,
          },
        ],
      },
    },
  });
  console.log('✅ Created product: Pantalón Negro Casual');

  // Belleza products
  const shampooCoco = await prisma.product.upsert({
    where: { id: 'product_shampoo_coco_test' },
    update: {},
    create: {
      id: 'product_shampoo_coco_test',
      name: 'Shampoo de Coco',
      description: 'Shampoo nutritivo con aceite de coco',
      categoryId: categoryBelleza.id,
      merchantId: merchant.id,
      isActive: true,
      variants: {
        create: [
          {
            sku: 'SHAMPOO-COCO-400ML',
            name: '400ml',
            price: 28000,
            stock: 25,
            isActive: true,
          },
        ],
      },
    },
  });
  console.log('✅ Created product: Shampoo de Coco');

  // Minimarket products
  const arroz = await prisma.product.upsert({
    where: { id: 'product_arroz_test' },
    update: {},
    create: {
      id: 'product_arroz_test',
      name: 'Arroz Blanco Premium',
      description: 'Arroz de grano largo de primera calidad',
      categoryId: categoryMinimarket.id,
      merchantId: merchant.id,
      isActive: true,
      variants: {
        create: [
          {
            sku: 'ARROZ-1KG',
            name: '1kg',
            price: 4500,
            stock: 50,
            isActive: true,
          },
          {
            sku: 'ARROZ-5KG',
            name: '5kg',
            price: 22000,
            stock: 20,
            isActive: true,
          },
        ],
      },
    },
  });
  console.log('✅ Created product: Arroz Blanco Premium');

  const aceite = await prisma.product.upsert({
    where: { id: 'product_aceite_test' },
    update: {},
    create: {
      id: 'product_aceite_test',
      name: 'Aceite de Girasol',
      description: 'Aceite vegetal 100% puro',
      categoryId: categoryMinimarket.id,
      merchantId: merchant.id,
      isActive: true,
      variants: {
        create: [
          {
            sku: 'ACEITE-1L',
            name: '1 litro',
            price: 12000,
            stock: 30,
            isActive: true,
          },
        ],
      },
    },
  });
  console.log('✅ Created product: Aceite de Girasol');

  console.log('\n🎉 Seeding completed!');
  console.log('\nTest data created:');
  console.log('- Merchant API Key:', merchant.apiKey);
  console.log('- Customer 1 phone:', customer1.phone);
  console.log('- Customer 2 phone:', customer2.phone);
  console.log('- Active conversations:', 2);
  console.log('- Categories:', 3);
  console.log('- Products:', 5);
  console.log('- Total variants:', 9);
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
