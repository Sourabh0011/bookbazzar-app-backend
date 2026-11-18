const express = require('express');
const router  = express.Router();
const { prisma } = require('../../config/prisma');
const { protect, authorise, asyncHandler } = require('../../middleware/auth.middleware');

// GET /api/orders – Get user's orders (buyer or seller)
router.get('/', protect, asyncHandler(async (req, res) => {
  const { role, id } = req.user;

  if (role === 'admin') {
    const orders = await prisma.order.findMany({
      include: {
        address: true,
        buyer: { select: { id: true, fullName: true, email: true } },
        payment: true,
        items: {
          include: {
            book: { select: { id: true, title: true, coverImage: true, price: true } },
            seller: { select: { id: true, fullName: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ success: true, data: orders });
  }

  if (role === 'seller') {
    // Orders where seller has items
    const orders = await prisma.order.findMany({
      where: {
        items: {
          some: { sellerId: id },
        },
      },
      include: {
        address: true,
        buyer: { select: { id: true, fullName: true, email: true, phone: true } },
        payment: true,
        items: {
          where: { sellerId: id },
          include: {
            book: { select: { id: true, title: true, coverImage: true, price: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ success: true, data: orders });
  }

  // Buyer orders
  const orders = await prisma.order.findMany({
    where: { buyerId: id },
    include: {
      address: true,
      payment: true,
      items: {
        include: {
          book: { select: { id: true, title: true, author: true, coverImage: true, price: true } },
          seller: { select: { id: true, fullName: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json({ success: true, data: orders });
}));

// GET /api/orders/:id – Get single order detail
router.get('/:id', protect, asyncHandler(async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: {
      address: true,
      buyer: { select: { id: true, fullName: true, email: true, phone: true } },
      payment: true,
      items: {
        include: {
          book: { select: { id: true, title: true, author: true, coverImage: true, price: true } },
          seller: { select: { id: true, fullName: true, phone: true } },
        },
      },
    },
  });

  if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

  // Authorization check: buyer, seller of an item, or admin
  const isBuyer = order.buyerId === req.user.id;
  const isSellerOfItem = order.items.some((item) => item.sellerId === req.user.id);
  const isAdmin = req.user.role === 'admin';

  if (!isBuyer && !isSellerOfItem && !isAdmin) {
    return res.status(403).json({ success: false, message: 'Not authorised to view this order' });
  }

  res.json({ success: true, data: order });
}));

// POST /api/orders – Place order (atomic transaction for order creation + stock deduction)
router.post('/', protect, asyncHandler(async (req, res) => {
  const { addressId, items, paymentMethod = 'COD' } = req.body;

  if (!addressId) return res.status(400).json({ success: false, message: 'addressId is required' });
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: 'Items array cannot be empty' });
  }

  // Verify address belongs to user
  const address = await prisma.address.findUnique({ where: { id: addressId } });
  if (!address || address.userId !== req.user.id) {
    return res.status(400).json({ success: false, message: 'Invalid delivery address' });
  }

  // Collect book IDs and verify availability
  const bookIds = items.map((i) => i.bookId);
  const books = await prisma.book.findMany({
    where: { id: { in: bookIds } },
  });

  const bookMap = new Map(books.map((b) => [b.id, b]));

  let totalAmount = 0;
  const verifiedOrderItems = [];

  for (const item of items) {
    const book = bookMap.get(item.bookId);
    if (!book) {
      return res.status(400).json({ success: false, message: `Book ${item.bookId} not found` });
    }
    if (book.status !== 'ACTIVE') {
      return res.status(400).json({ success: false, message: `Book "${book.title}" is no longer available` });
    }
    const qty = parseInt(item.quantity, 10) || 1;
    if (book.stock < qty) {
      return res.status(400).json({
        success: false,
        message: `Not enough stock for "${book.title}". Available: ${book.stock}`,
      });
    }

    const itemPrice = parseFloat(book.price);
    totalAmount += itemPrice * qty;

    verifiedOrderItems.push({
      bookId: book.id,
      sellerId: book.sellerId,
      quantity: qty,
      price: itemPrice,
    });
  }

  const shippingAmount = totalAmount >= 499 ? 0.0 : 40.0;
  const finalTotal = parseFloat((totalAmount + shippingAmount).toFixed(2));

  // Run everything inside an ACID transaction
  const order = await prisma.$transaction(async (tx) => {
    // 1. Create Order
    const newOrder = await tx.order.create({
      data: {
        buyerId: req.user.id,
        addressId,
        totalAmount,
        shippingAmount,
        status: 'PLACED',
        paymentStatus: 'PENDING',
        items: {
          create: verifiedOrderItems,
        },
      },
      include: {
        items: true,
      },
    });

    // 2. Decrement stock for each book
    for (const item of verifiedOrderItems) {
      const book = bookMap.get(item.bookId);
      const remainingStock = book.stock - item.quantity;
      await tx.book.update({
        where: { id: item.bookId },
        data: {
          stock: remainingStock,
          status: remainingStock <= 0 ? 'SOLD' : 'ACTIVE',
        },
      });
    }

    // 3. Create initial Payment record
    const normMethod = paymentMethod.toUpperCase() === 'RAZORPAY' ? 'RAZORPAY' : 'COD';
    await tx.payment.create({
      data: {
        orderId: newOrder.id,
        paymentMethod: normMethod,
        amount: finalTotal,
        status: 'PENDING',
      },
    });

    // 4. Remove purchased items from user's cart
    const userCart = await tx.cart.findUnique({ where: { userId: req.user.id } });
    if (userCart) {
      await tx.cartItem.deleteMany({
        where: {
          cartId: userCart.id,
          bookId: { in: bookIds },
        },
      });
    }

    return newOrder;
  });

  res.status(201).json({
    success: true,
    message: 'Order placed successfully',
    data: order,
  });
}));

// PUT /api/orders/:id/cancel – Buyer cancels their own order
router.put('/:id/cancel', protect, asyncHandler(async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: { items: true },
  });
  if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
  if (order.buyerId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Not authorised to cancel this order' });
  }
  if (['SHIPPED', 'DELIVERED', 'CANCELLED'].includes(order.status)) {
    return res.status(400).json({ success: false, message: `Cannot cancel order with status ${order.status}` });
  }

  await prisma.$transaction(async (tx) => {
    for (const item of order.items) {
      await tx.book.update({
        where: { id: item.bookId },
        data: {
          stock: { increment: item.quantity },
          status: 'ACTIVE',
        },
      });
    }
    await tx.order.update({
      where: { id: req.params.id },
      data: { status: 'CANCELLED' },
    });
  });

  res.json({ success: true, message: 'Order cancelled successfully and stock restored' });
}));

// PUT /api/orders/:id/status – Update order status (Seller or Admin)
router.put('/:id/status', protect, authorise('seller', 'admin'), asyncHandler(async (req, res) => {
  const { status } = req.body;
  const statusUpper = (status || '').toUpperCase();

  const validStatuses = ['PLACED', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED'];
  if (!validStatuses.includes(statusUpper)) {
    return res.status(400).json({ success: false, message: 'Invalid status' });
  }

  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: { items: true },
  });
  if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

  // If cancelling, restore stock in transaction
  if (statusUpper === 'CANCELLED' && order.status !== 'CANCELLED') {
    await prisma.$transaction(async (tx) => {
      for (const item of order.items) {
        await tx.book.update({
          where: { id: item.bookId },
          data: {
            stock: { increment: item.quantity },
            status: 'ACTIVE',
          },
        });
      }
      await tx.order.update({
        where: { id: req.params.id },
        data: { status: 'CANCELLED' },
      });
    });

    return res.json({ success: true, message: 'Order cancelled and stock restored' });
  }

  const updated = await prisma.order.update({
    where: { id: req.params.id },
    data: { status: statusUpper },
  });

  res.json({ success: true, data: updated });
}));

module.exports = router;
