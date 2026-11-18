const express = require('express');
const router  = express.Router();
const { prisma } = require('../../config/prisma');
const { protect, asyncHandler } = require('../../middleware/auth.middleware');

// GET /api/wishlist – Get user wishlist
router.get('/', protect, asyncHandler(async (req, res) => {
  const wishlist = await prisma.wishlist.findMany({
    where: { userId: req.user.id },
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
          category: { select: { id: true, name: true } },
          seller: { select: { id: true, fullName: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json({
    success: true,
    data: wishlist.map((w) => ({
      id: w.id,
      bookId: w.bookId,
      createdAt: w.createdAt,
      book: w.book,
    })),
  });
}));

// POST /api/wishlist/:bookId – Add book to wishlist
router.post('/:bookId', protect, asyncHandler(async (req, res) => {
  const { bookId } = req.params;

  const book = await prisma.book.findUnique({ where: { id: bookId } });
  if (!book) return res.status(404).json({ success: false, message: 'Book not found' });

  const existing = await prisma.wishlist.findUnique({
    where: {
      userId_bookId: {
        userId: req.user.id,
        bookId,
      },
    },
  });

  if (existing) {
    return res.status(200).json({ success: true, message: 'Book already in wishlist', data: existing });
  }

  const wishlistItem = await prisma.wishlist.create({
    data: {
      userId: req.user.id,
      bookId,
    },
    include: { book: true },
  });

  res.status(201).json({ success: true, data: wishlistItem });
}));

// DELETE /api/wishlist/:bookId – Remove book from wishlist
router.delete('/:bookId', protect, asyncHandler(async (req, res) => {
  const { bookId } = req.params;

  const existing = await prisma.wishlist.findUnique({
    where: {
      userId_bookId: {
        userId: req.user.id,
        bookId,
      },
    },
  });

  if (!existing) {
    return res.status(404).json({ success: false, message: 'Item not in wishlist' });
  }

  await prisma.wishlist.delete({
    where: { id: existing.id },
  });

  res.json({ success: true, message: 'Item removed from wishlist' });
}));

module.exports = router;
