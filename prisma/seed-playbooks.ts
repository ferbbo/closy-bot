/**
 * Seed script for playbooks (PR-11)
 * Creates sample merchants with each playbook type for testing
 * Run with: pnpm db:seed:playbooks
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedPlaybooks() {
  console.log('🌱 Seeding playbooks...');

  const merchants = [
    {
      name: 'Fashion Store Demo',
      whatsappNumber: '+573001111111',
      apiKey: 'test-api-key-ropa-demo',
      industry: 'ropa' as const,
    },
    {
      name: 'Beauty Corner Demo',
      whatsappNumber: '+573002222222',
      apiKey: 'test-api-key-belleza-demo',
      industry: 'belleza' as const,
    },
    {
      name: 'Minimarket Express Demo',
      whatsappNumber: '+573003333333',
      apiKey: 'test-api-key-minimarket-demo',
      industry: 'minimarket' as const,
    },
  ];

  for (const merchantData of merchants) {
    const merchant = await prisma.merchant.upsert({
      where: { apiKey: merchantData.apiKey },
      update: {
        industry: merchantData.industry,
        name: merchantData.name,
        whatsappNumber: merchantData.whatsappNumber,
      },
      create: merchantData,
    });

    console.log(`✅ Created/updated merchant: ${merchant.name} (${merchant.industry})`);
  }

  console.log('✅ Playbook seeding complete!');
}

seedPlaybooks()
  .catch((error) => {
    console.error('❌ Error seeding playbooks:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
