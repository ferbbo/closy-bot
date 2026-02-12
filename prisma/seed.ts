import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Seed script for PR-02: Customer, Merchant, Conversation
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

  console.log('🎉 Seeding completed!');
  console.log('\nTest data created:');
  console.log('- Merchant API Key:', merchant.apiKey);
  console.log('- Customer 1 phone:', customer1.phone);
  console.log('- Customer 2 phone:', customer2.phone);
  console.log('- Active conversations:', 2);
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
