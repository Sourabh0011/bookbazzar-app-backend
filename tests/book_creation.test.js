const request = require('supertest');
const app = require('../src/app');
const { prisma } = require('../src/config/prisma');

describe('Seller Book Creation and Listing API', () => {
  let sellerToken;
  let buyerToken;
  let categoryId;
  let createdBookId;

  beforeAll(async () => {
    // 1. Authenticate Seller
    const sellerRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'seller@bookbazzar.in', password: 'Seller@123' });
    expect(sellerRes.status).toBe(200);
    sellerToken = sellerRes.body.accessToken;

    // 2. Authenticate Buyer
    const buyerRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'buyer.test01@example.com', password: 'Test@12345' });
    expect(buyerRes.status).toBe(200);
    buyerToken = buyerRes.body.accessToken;

    // 3. Get valid Category
    const cat = await prisma.category.findFirst({ where: { isActive: true } });
    expect(cat).toBeTruthy();
    categoryId = cat.id;
  });

  afterAll(async () => {
    // Clean up test book if created
    if (createdBookId) {
      await prisma.book.deleteMany({ where: { id: createdBookId } });
    }
    await prisma.$disconnect();
  });

  test('POST /api/books should fail with 401 when unauthenticated', async () => {
    const res = await request(app)
      .post('/api/books')
      .send({
        title: 'Unauthorized Test',
        author: 'Unknown',
        price: 299,
        categoryId,
      });

    expect(res.status).toBe(401);
  });

  test('POST /api/books should fail with 403 when authenticated as BUYER', async () => {
    const res = await request(app)
      .post('/api/books')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({
        title: 'Buyer Attempted Book',
        author: 'Buyer Author',
        price: 299,
        categoryId,
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/not permitted/i);
  });

  test('POST /api/books should validate required fields for SELLER', async () => {
    const res = await request(app)
      .post('/api/books')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        title: 'Missing Fields Book',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('POST /api/books should return 400 validation error when description is missing or empty', async () => {
    // 1. Missing description
    const resMissing = await request(app)
      .post('/api/books')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        title: 'Book without description',
        author: 'Some Author',
        categoryId,
        price: 399,
      });

    expect(resMissing.status).toBe(400);
    expect(resMissing.body.success).toBe(false);
    expect(resMissing.body.message).toMatch(/description is required/i);

    // 2. Empty whitespace description
    const resEmpty = await request(app)
      .post('/api/books')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        title: 'Book with blank description',
        author: 'Some Author',
        categoryId,
        price: 399,
        description: '   ',
      });

    expect(resEmpty.status).toBe(400);
    expect(resEmpty.body.success).toBe(false);
    expect(resEmpty.body.message).toMatch(/description is required/i);
  });

  test('POST /api/books should successfully create a new book using Prisma relation connect', async () => {
    const newBookPayload = {
      title: 'Jest Automated Test Book – Database Systems',
      author: 'Silberschatz, Korth, Sudarshan',
      description: 'Comprehensive coverage of database concepts, normalization, and transaction processing.',
      price: 550,
      originalPrice: 1100,
      condition: 'LIKE_NEW',
      categoryId,
      coverImage: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&q=80&w=600',
      stock: 3,
      status: 'ACTIVE',
    };

    const res = await request(app)
      .post('/api/books')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send(newBookPayload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.title).toBe(newBookPayload.title);
    expect(res.body.data.condition).toBe('LIKE_NEW');
    expect(Number(res.body.data.price)).toBe(550);
    expect(Number(res.body.data.originalPrice)).toBe(1100);
    expect(res.body.data.stock).toBe(3);
    expect(res.body.data.status).toBe('ACTIVE');
    expect(res.body.data.category).toBeDefined();
    expect(res.body.data.category.id).toBe(categoryId);
    expect(res.body.data.seller).toBeDefined();

    createdBookId = res.body.data.id;

    // Verify record in MySQL database directly
    const dbBook = await prisma.book.findUnique({
      where: { id: createdBookId },
      include: { seller: true, category: true },
    });

    expect(dbBook).toBeTruthy();
    expect(dbBook.title).toBe(newBookPayload.title);
    expect(dbBook.category.id).toBe(categoryId);
    expect(dbBook.seller.role).toBe('SELLER');
  });

  test('GET /api/books/seller/my-listings should include the newly created book', async () => {
    const res = await request(app)
      .get('/api/books/seller/my-listings')
      .set('Authorization', `Bearer ${sellerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);

    const found = res.body.data.find((b) => b.id === createdBookId);
    expect(found).toBeDefined();
    expect(found.title).toBe('Jest Automated Test Book – Database Systems');
  });

  test('GET /api/books (marketplace) should include the ACTIVE book', async () => {
    const res = await request(app).get('/api/books');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const found = res.body.data.find((b) => b.id === createdBookId);
    expect(found).toBeDefined();
    expect(found.status).toBe('ACTIVE');
  });
});
