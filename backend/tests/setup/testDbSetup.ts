import { PrismaClient } from '@prisma/client';

// Use separate test database
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  'postgresql://kgolf:kgolf_password@localhost:5432/kgolf_test';

export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: TEST_DATABASE_URL,
    },
  },
  log: process.env.DEBUG_TESTS ? ['query', 'error', 'warn'] : ['error'],
});

/**
 * Clear all tables in the database
 * Order matters: delete in reverse FK dependency order
 */
export async function clearDatabase() {
  await prisma.$transaction([
    // Delete dependent records first
    prisma.phoneVerificationToken.deleteMany(),
    prisma.booking.deleteMany(),
    prisma.session.deleteMany(),
    prisma.emailVerificationToken.deleteMany(),
    prisma.authProvider.deleteMany(),
    prisma.setting.deleteMany(),
    
    // Then delete users and rooms (no dependencies)
    prisma.user.deleteMany(),
    prisma.room.deleteMany(),
  ]);
}

/**
 * Seed baseline test data
 * Creates rooms and default settings needed for most tests
 */
export async function seedTestData() {
  // Create test rooms
  const room1 = await prisma.room.create({
    data: {
      name: 'Test Room 1',
      capacity: 4,
      status: 'ACTIVE',
      active: true,
    },
  });

  const room2 = await prisma.room.create({
    data: {
      name: 'Test Room 2',
      capacity: 4,
      status: 'ACTIVE',
      active: true,
    },
  });

  // Create default tax rate setting
  await prisma.setting.create({
    data: {
      key: 'global_tax_rate',
      value: '8',
      valueType: 'number',
      description: 'Test tax rate',
      category: 'tax',
      isPublic: true,
    },
  });

  return { room1, room2 };
}

/**
 * Disconnect Prisma client
 * Call this in afterAll hooks
 */
export async function disconnectPrisma() {
  await prisma.$disconnect();
}
