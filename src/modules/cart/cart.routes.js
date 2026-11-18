const express = require('express');
const router  = express.Router();
const { prisma } = require('../../config/prisma');
const { protect, asyncHandler } = require('../../middleware/auth.middleware');

// Helper to get or create cart
const getOrCreateCart = async (userId) => {
  let cart = await prisma.cart.findUnique({
    where: { userId },
  });
  if (!cart) {
    cart = await prisma.cart.create({
      data: { userId },
    });
  }
  return cart;
};

// GET /api/cart
router.get('/', protect, asyncHandler(async (req, res) => {
  const cart = await getOrCreateCart(req.user.id);

  const cartWithItems = await prisma.cart.findUnique({
    where: { id: cart.id },
    include: {
      items: {
        include: {
          book: {
            select: {
              id: true,
              title: true,
              author: true,
              price: true,
              originalPrice: true,
              condition: true,
              coverImage: true,
              stock: true,
              status: true,
              seller: { select: { id: true, fullName: true } },
            },
          },
        },
      },
    },
  });

  const items = cartWithItems?.items || [];
  let totalAmount = 0;
  let totalItems = 0;

  items.forEach((item) => {
    if (item.book && item.book.status === 'ACTIVE') {
      totalAmount += parseFloat(item.book.price) * item.quantity;
      totalItems += item.quantity;
    }
  });

  res.json({
    success: true,
    data: {
      id: cart.id,
      items,
      totalItems,
      totalAmount: parseFloat(totalAmount.toFixed(2)),
    },
  });
}));

// POST /api/cart/items – Add item to cart
router.post('/items', protect, asyncHandler(async (req, res) => {
  const { bookId, quantity = 1 } = req.body;
  if (!bookId) return res.status(400).json({ success: false, message: 'bookId is required' });

  const book = await prisma.book.findUnique({ where: { id: bookId } });
  if (!book) return res.status(404).json({ success: false, message: 'Book not found' });
  if (book.status !== 'ACTIVE') {
    return res.status(400).json({ success: false, message: 'This book is not currently available' });
  }

  const qty = Math.max(1, parseInt(quantity, 10) || 1);
  if (book.stock < qty) {
    return res.status(400).json({ success: false, message: `Only ${book.stock} copy/copies available` });
  }

  const cart = await getOrCreateCart(req.user.id);

  // Check if item already in cart
  const existingItem = await prisma.cartItem.findUnique({
    where: {
      cartId_bookId: {
        cartId: cart.id,
        bookId,
      },
    },
  });

  let cartItem;
  if (existingItem) {
    const newQty = existingItem.quantity + qty;
    if (book.stock < newQty) {
      return res.status(400).json({ success: false, message: `Cannot add more. Only ${book.stock} available in total.` });
    }
    cartItem = await prisma.cartItem.update({
      where: { id: existingItem.id },
      data: { quantity: newQty },
      include: { book: true },
    });
  } else {
    cartItem = await prisma.cartItem.create({
      data: {
        cartId: cart.id,
        bookId,
        quantity: qty,
      },
      include: { book: true },
    });
  }

  res.status(201).json({ success: true, data: cartItem });
}));

// PUT /api/cart/items/:id – Update quantity
router.put('/items/:id', protect, asyncHandler(async (req, res) => {
  const { quantity } = req.body;
  const qty = parseInt(quantity, 10);

  const cart = await getOrCreateCart(req.user.id);
  const cartItem = await prisma.cartItem.findUnique({
    where: { id: req.params.id },
    include: { book: true },
  });

  if (!cartItem || cartItem.cartId !== cart.id) {
    return res.status(404).json({ success: false, message: 'Cart item not found' });
  }

  if (qty <= 0) {
    await prisma.cartItem.delete({ where: { id: req.params.id } });
    return res.json({ success: true, message: 'Item removed from cart' });
  }

  if (cartItem.book.stock < qty) {
    return res.status(400).json({
      success: false,
      message: `Only ${cartItem.book.stock} copy/copies available`,
    });
  }

  const updated = await prisma.cartItem.update({
    where: { id: req.params.id },
    data: { quantity: qty },
    include: { book: true },
  });

  res.json({ success: true, data: updated });
}));

// DELETE /api/cart/items/:id – Remove item
router.delete('/items/:id', protect, asyncHandler(async (req, res) => {
  const cart = await getOrCreateCart(req.user.id);
  const cartItem = await prisma.cartItem.findUnique({ where: { id: req.params.id } });

  if (!cartItem || cartItem.cartId !== cart.id) {
    return res.status(404).json({ success: false, message: 'Cart item not found' });
  }

  await prisma.cartItem.delete({ where: { id: req.params.id } });
  res.json({ success: true, message: 'Item removed from cart' });
}));

// DELETE /api/cart – Clear cart
router.delete('/', protect, asyncHandler(async (req, res) => {
  const cart = await getOrCreateCart(req.user.id);
  await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
  res.json({ success: true, message: 'Cart cleared' });
}));

module.exports = router;
