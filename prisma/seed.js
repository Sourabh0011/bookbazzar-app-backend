const { prisma } = require('../src/config/prisma');
const bcrypt = require('bcryptjs');

async function main() {
  console.log('🌱 Seeding database...');

  // 1. Create default admin and seller if not present
  const adminPassword = await bcrypt.hash('Admin@BookBazzar2026', 12);
  const sellerPassword = await bcrypt.hash('Seller@123', 12);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@bookbazzar.in' },
    update: {},
    create: {
      fullName: 'BookBazzar Admin',
      email: 'admin@bookbazzar.in',
      password: adminPassword,
      role: 'ADMIN',
      phone: '9876543210',
      isVerified: true,
    },
  });

  const seller = await prisma.user.upsert({
    where: { email: 'seller@bookbazzar.in' },
    update: {},
    create: {
      fullName: 'Rahul Sharma (Seller)',
      email: 'seller@bookbazzar.in',
      password: sellerPassword,
      role: 'SELLER',
      phone: '9812345678',
      isVerified: true,
    },
  });

  // 2. Create Categories
  const categoriesData = [
    { name: 'Computer Science', description: 'Algorithms, Data Structures, Web Development, AI & ML' },
    { name: 'Electronics & Communication', description: 'Circuits, Signals, Microprocessors & Embedded Systems' },
    { name: 'Mechanical Engineering', description: 'Thermodynamics, Fluid Mechanics, CAD/CAM' },
    { name: 'Civil Engineering', description: 'Structural Analysis, Surveying, Construction' },
    { name: 'Competitive Exams', description: 'GATE, CAT, UPSC, JEE books and question banks' },
    { name: 'Mathematics & Science', description: 'Calculus, Linear Algebra, Physics & Chemistry' },
  ];

  const categories = [];
  for (const cat of categoriesData) {
    const created = await prisma.category.upsert({
      where: { name: cat.name },
      update: {},
      create: cat,
    });
    categories.push(created);
  }

  // 3. Create Sample Books
  const booksData = [
    {
      title: 'Introduction to Algorithms (CLRS)',
      author: 'Thomas H. Cormen, Charles E. Leiserson',
      description: 'Comprehensive textbook on computer algorithms, 3rd edition. Light pencil marks on some pages, otherwise like new.',
      price: 650.00,
      originalPrice: 1450.00,
      condition: 'LIKE_NEW',
      stock: 3,
      categoryName: 'Computer Science',
      coverImage: 'https://images.unsplash.com/photo-1532012164546-f432f2e3edd4?auto=format&fit=crop&q=80&w=600',
    },
    {
      title: 'Operating System Concepts (Dinosaur Book)',
      author: 'Abraham Silberschatz, Peter B. Galvin',
      description: 'Essential textbook for OS syllabus. Covers processes, memory management, threads, and storage.',
      price: 450.00,
      originalPrice: 995.00,
      condition: 'GOOD',
      stock: 2,
      categoryName: 'Computer Science',
      coverImage: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&q=80&w=600',
    },
    {
      title: 'Higher Engineering Mathematics',
      author: 'Dr. B.S. Grewal',
      description: '44th Edition. Complete coverage of engineering mathematics with solved problems and practice papers.',
      price: 499.00,
      originalPrice: 1100.00,
      condition: 'LIKE_NEW',
      stock: 4,
      categoryName: 'Mathematics & Science',
      coverImage: 'https://images.unsplash.com/photo-1509228468518-180dd4864904?auto=format&fit=crop&q=80&w=600',
    },
    {
      title: 'GATE Computer Science 2026 Chapterwise Solved',
      author: 'Made Easy Publications',
      description: 'Contains previous 30 years solved papers with step-by-step analytical explanations.',
      price: 380.00,
      originalPrice: 850.00,
      condition: 'GOOD',
      stock: 1,
      categoryName: 'Competitive Exams',
      coverImage: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&q=80&w=600',
    },
    {
      title: 'Electronic Devices and Circuit Theory',
      author: 'Robert L. Boylestad',
      description: 'Standard textbook for semiconductor devices, diodes, transistors, and FET amplifiers.',
      price: 520.00,
      originalPrice: 1200.00,
      condition: 'ACCEPTABLE',
      stock: 2,
      categoryName: 'Electronics & Communication',
      coverImage: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&q=80&w=600',
    },
  ];

  for (const b of booksData) {
    const cat = categories.find((c) => c.name === b.categoryName);
    if (!cat) continue;

    const existingBook = await prisma.book.findFirst({
      where: { title: b.title, sellerId: seller.id },
    });

    if (!existingBook) {
      await prisma.book.create({
        data: {
          sellerId: seller.id,
          categoryId: cat.id,
          title: b.title,
          author: b.author,
          description: b.description,
          price: b.price,
          originalPrice: b.originalPrice,
          condition: b.condition,
          stock: b.stock,
          coverImage: b.coverImage,
          status: 'ACTIVE',
        },
      });
    }
  }

  console.log('✅ Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
