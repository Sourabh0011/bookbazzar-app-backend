const express = require('express');
const router  = express.Router();
const { prisma } = require('../../config/prisma');
const { protect, authorise, asyncHandler } = require('../../middleware/auth.middleware');

// GET /api/books – list books with search, filter, sort, pagination
router.get('/', asyncHandler(async (req, res) => {
  const {
    search, q, categoryId, category, condition, minPrice, maxPrice,
    sort = 'newest', page = 1, limit = 20, sellerId
  } = req.query;

  const searchQuery = search || q;
  const where = {
    status: 'ACTIVE',
  };

  if (sellerId) {
    where.sellerId = sellerId;
    delete where.status; // allow seller to see their own regardless of status if filtered
  }

  if (categoryId) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(categoryId);
    if (isUuid) {
      where.categoryId = categoryId;
    } else {
      where.category = { name: { contains: categoryId } };
    }
  } else if (category) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(category);
    if (isUuid) {
      where.categoryId = category;
    } else {
      where.category = { name: { contains: category } };
    }
  }

  if (condition) {
    const condUpper = condition.toUpperCase().replace(/\s+/g, '_');
    if (['LIKE_NEW', 'GOOD', 'ACCEPTABLE'].includes(condUpper)) {
      where.condition = condUpper;
    }
  }

  if (minPrice || maxPrice) {
    where.price = {};
    if (minPrice) where.price.gte = parseFloat(minPrice);
    if (maxPrice) where.price.lte = parseFloat(maxPrice);
  }

  if (searchQuery) {
    where.OR = [
      { title: { contains: searchQuery } },
      { author: { contains: searchQuery } },
      { description: { contains: searchQuery } },
    ];
  }

  let orderBy = { createdAt: 'desc' };
  if (sort === 'price_low' || sort === 'priceAsc') orderBy = { price: 'asc' };
  else if (sort === 'price_high' || sort === 'priceDesc') orderBy = { price: 'desc' };
  else if (sort === 'oldest') orderBy = { createdAt: 'asc' };

  const take = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

  const [books, total] = await Promise.all([
    prisma.book.findMany({
      where,
      include: {
        category: { select: { id: true, name: true } },
        seller: { select: { id: true, fullName: true, profileImage: true } },
      },
      orderBy,
      skip,
      take,
    }),
    prisma.book.count({ where }),
  ]);

  res.json({
    success: true,
    data: books,
    pagination: {
      total,
      page: Number(page) || 1,
      pages: Math.ceil(total / take),
      limit: take,
    },
  });
}));

// GET /api/books/search – dedicated search endpoint
router.get('/search', asyncHandler(async (req, res) => {
  const { q = '', page = 1, limit = 20 } = req.query;
  const take = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

  const where = {
    status: 'ACTIVE',
    OR: [
      { title: { contains: q } },
      { author: { contains: q } },
      { description: { contains: q } },
    ],
  };

  const [books, total] = await Promise.all([
    prisma.book.findMany({
      where,
      include: {
        category: { select: { id: true, name: true } },
        seller: { select: { id: true, fullName: true, profileImage: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    prisma.book.count({ where }),
  ]);

  res.json({
    success: true,
    data: books,
    pagination: {
      total,
      page: Number(page) || 1,
      pages: Math.ceil(total / take),
      limit: take,
    },
  });
}));

// GET /api/books/featured – featured / trending books
router.get('/featured', asyncHandler(async (req, res) => {
  const books = await prisma.book.findMany({
    where: { status: 'ACTIVE' },
    include: {
      category: { select: { id: true, name: true } },
      seller: { select: { id: true, fullName: true, profileImage: true } },
    },
    take: 10,
    orderBy: { createdAt: 'desc' },
  });
  res.json({ success: true, data: books });
}));

// GET /api/books/seller/my-listings – Seller's own listings (all statuses)
router.get('/seller/my-listings', protect, authorise('seller', 'admin'), asyncHandler(async (req, res) => {
  const books = await prisma.book.findMany({
    where: { sellerId: req.user.id },
    include: {
      category: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ success: true, data: books });
}));

// GET /api/books/seller/analytics – Seller's dashboard analytics & metrics
router.get('/seller/analytics', protect, authorise('seller', 'admin'), asyncHandler(async (req, res) => {
  const sellerId = req.user.id;

  // 1. Listings counts
  const [totalListings, activeListings, soldListings] = await Promise.all([
    prisma.book.count({ where: { sellerId } }),
    prisma.book.count({ where: { sellerId, status: 'ACTIVE' } }),
    prisma.book.count({ where: { sellerId, status: 'SOLD' } }),
  ]);

  // 2. Order items for this seller
  const orderItems = await prisma.orderItem.findMany({
    where: {
      sellerId,
      order: {
        status: { not: 'CANCELLED' },
      },
    },
    include: {
      order: { select: { id: true, status: true, createdAt: true } },
      book: { select: { id: true, title: true, coverImage: true } },
    },
    orderBy: { order: { createdAt: 'desc' } },
  });

  const totalOrdersSet = new Set(orderItems.map((item) => item.orderId));
  const totalOrders = totalOrdersSet.size;

  let totalRevenue = 0;
  for (const item of orderItems) {
    totalRevenue += parseFloat(item.price) * item.quantity;
  }

  // 3. Monthly sales breakdown (last 6 months)
  const monthlyMap = new Map();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const key = `${months[d.getMonth()]} ${d.getFullYear()}`;
    monthlyMap.set(key, { month: key, amount: 0, orders: 0 });
  }

  for (const item of orderItems) {
    const d = new Date(item.order.createdAt);
    const key = `${months[d.getMonth()]} ${d.getFullYear()}`;
    if (monthlyMap.has(key)) {
      const entry = monthlyMap.get(key);
      entry.amount += parseFloat(item.price) * item.quantity;
      entry.orders += 1;
    }
  }

  res.json({
    success: true,
    data: {
      totalListings,
      activeListings,
      soldListings,
      totalOrders,
      totalRevenue: parseFloat(totalRevenue.toFixed(2)),
      monthlySales: Array.from(monthlyMap.values()),
    },
  });
}));

// GET /api/books/:id
router.get('/:id', asyncHandler(async (req, res) => {
  const book = await prisma.book.findUnique({
    where: { id: req.params.id },
    include: {
      category: { select: { id: true, name: true, description: true } },
      seller: { select: { id: true, fullName: true, profileImage: true, email: true, phone: true } },
    },
  });

  if (!book) {
    return res.status(404).json({ success: false, message: 'Book not found' });
  }

  res.json({ success: true, data: book });
}));

// POST /api/books – create listing (seller or admin)
router.post('/', protect, authorise('seller', 'admin'), asyncHandler(async (req, res) => {
  const {
    title, author, description, price, originalPrice,
    condition, categoryId, coverImage, stock, status
  } = req.body;

  if (!title || !author || price === undefined || price === null || !categoryId) {
    return res.status(400).json({
      success: false,
      message: 'Title, author, price, and categoryId are required',
    });
  }

  if (!description || typeof description !== 'string' || !description.trim()) {
    return res.status(400).json({
      success: false,
      message: 'Description is required and must not be empty',
    });
  }

  const parsedPrice = parseFloat(price);
  if (isNaN(parsedPrice) || parsedPrice < 0) {
    return res.status(400).json({
      success: false,
      message: 'Price must be a valid non-negative number',
    });
  }

  // Verify category exists
  const cat = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!cat) {
    return res.status(400).json({ success: false, message: 'Invalid categoryId' });
  }

  let cond = 'GOOD';
  if (condition) {
    const c = condition.toUpperCase().replace(/\s+/g, '_');
    if (['LIKE_NEW', 'GOOD', 'ACCEPTABLE'].includes(c)) cond = c;
  }

  let bookStatus = 'ACTIVE';
  if (status) {
    const s = status.toUpperCase();
    if (['ACTIVE', 'SOLD', 'INACTIVE'].includes(s)) bookStatus = s;
  }

  let parsedOriginalPrice = null;
  if (originalPrice !== undefined && originalPrice !== null && originalPrice !== '') {
    const op = parseFloat(originalPrice);
    if (!isNaN(op) && op >= 0) parsedOriginalPrice = op;
  }

  let parsedStock = 1;
  if (stock !== undefined && stock !== null) {
    const st = parseInt(stock, 10);
    if (!isNaN(st) && st >= 0) parsedStock = st;
  }

  // Use consistent Prisma relation connect for seller & category (no scalar sellerId/categoryId conflict)
  const book = await prisma.book.create({
    data: {
      title: title.trim(),
      author: author.trim(),
      description: description.trim(),
      price: parsedPrice,
      originalPrice: parsedOriginalPrice,
      condition: cond,
      coverImage: coverImage ? coverImage.trim() : null,
      stock: parsedStock,
      status: bookStatus,
      seller: {
        connect: { id: req.user.id },
      },
      category: {
        connect: { id: categoryId },
      },
    },
    include: {
      category: { select: { id: true, name: true } },
      seller: { select: { id: true, fullName: true, email: true, profileImage: true } },
    },
  });

  res.status(201).json({ success: true, data: book });
}));

// PUT /api/books/:id – update listing (owner seller or admin)
router.put('/:id', protect, authorise('seller', 'admin'), asyncHandler(async (req, res) => {
  const book = await prisma.book.findUnique({ where: { id: req.params.id } });
  if (!book) return res.status(404).json({ success: false, message: 'Book not found' });

  if (req.user.role === 'seller' && book.sellerId !== req.user.id) {
    return res.status(403).json({ success: false, message: 'Not authorised to edit this listing' });
  }

  const updateData = {};
  const { title, author, description, price, originalPrice, condition, categoryId, coverImage, stock, status } = req.body;

  if (title !== undefined) updateData.title = title.trim();
  if (author !== undefined) updateData.author = author.trim();
  if (description !== undefined) {
    if (description === null || typeof description !== 'string' || !description.trim()) {
      return res.status(400).json({ success: false, message: 'Description must not be empty' });
    }
    updateData.description = description.trim();
  }
  if (price !== undefined) {
    const p = parseFloat(price);
    if (!isNaN(p) && p >= 0) updateData.price = p;
  }
  if (originalPrice !== undefined) {
    if (originalPrice === null || originalPrice === '') {
      updateData.originalPrice = null;
    } else {
      const op = parseFloat(originalPrice);
      if (!isNaN(op) && op >= 0) updateData.originalPrice = op;
    }
  }
  if (coverImage !== undefined) updateData.coverImage = coverImage ? coverImage.trim() : null;
  if (stock !== undefined) {
    const st = parseInt(stock, 10);
    if (!isNaN(st) && st >= 0) updateData.stock = st;
  }
  if (categoryId !== undefined) {
    const cat = await prisma.category.findUnique({ where: { id: categoryId } });
    if (!cat) return res.status(400).json({ success: false, message: 'Invalid categoryId' });
    updateData.category = { connect: { id: categoryId } };
  }
  if (condition !== undefined) {
    const c = condition.toUpperCase().replace(/\s+/g, '_');
    if (['LIKE_NEW', 'GOOD', 'ACCEPTABLE'].includes(c)) updateData.condition = c;
  }
  if (status !== undefined) {
    const s = status.toUpperCase();
    if (['ACTIVE', 'SOLD', 'INACTIVE'].includes(s)) updateData.status = s;
  }

  const updated = await prisma.book.update({
    where: { id: req.params.id },
    data: updateData,
    include: {
      category: { select: { id: true, name: true } },
      seller: { select: { id: true, fullName: true, email: true, profileImage: true } },
    },
  });

  res.json({ success: true, data: updated });
}));

// DELETE /api/books/:id – delete listing (owner seller or admin)
router.delete('/:id', protect, authorise('seller', 'admin'), asyncHandler(async (req, res) => {
  const book = await prisma.book.findUnique({ where: { id: req.params.id } });
  if (!book) return res.status(404).json({ success: false, message: 'Book not found' });

  if (req.user.role === 'seller' && book.sellerId !== req.user.id) {
    return res.status(403).json({ success: false, message: 'Not authorised to delete this listing' });
  }

  await prisma.book.delete({ where: { id: req.params.id } });
  res.json({ success: true, message: 'Book deleted successfully' });
}));

module.exports = router;
