const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

const connectDB = async () => {
  try {
    await prisma.$connect();
    console.log('✅  MySQL connected via Prisma');
  } catch (error) {
    console.error(`❌  MySQL connection error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = { prisma, connectDB };
