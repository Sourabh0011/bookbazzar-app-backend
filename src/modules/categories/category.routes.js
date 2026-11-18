const express = require('express');
const router  = express.Router();
const { prisma } = require('../../config/prisma');
const { protect, authorise, asyncHandler } = require('../../middleware/auth.middleware');

// GET /api/categories
router.get('/', asyncHandler(async (req, res) => {
  const categories = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
    include: {
      _count: {
        select: { books: true },
      },
    },
  });
  res.json({ success: true, data: categories });
}));

// GET /api/categories/:id
router.get('/:id', asyncHandler(async (req, res) => {
  const category = await prisma.category.findUnique({
    where: { id: req.params.id },
  });
  if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
  res.json({ success: true, data: category });
}));

// POST /api/categories (admin only)
router.post('/', protect, authorise('admin'), asyncHandler(async (req, res) => {
  const { name, description, image } = req.body;
  if (!name) return res.status(400).json({ success: false, message: 'Name is required' });

  const category = await prisma.category.create({
    data: {
      name: name.trim(),
      description: description ? description.trim() : null,
      image: image || null,
    },
  });
  res.status(201).json({ success: true, data: category });
}));

// PUT /api/categories/:id (admin only)
router.put('/:id', protect, authorise('admin'), asyncHandler(async (req, res) => {
  const { name, description, image, isActive } = req.body;
  const updateData = {};
  if (name !== undefined) updateData.name = name.trim();
  if (description !== undefined) updateData.description = description;
  if (image !== undefined) updateData.image = image;
  if (isActive !== undefined) updateData.isActive = Boolean(isActive);

  const category = await prisma.category.update({
    where: { id: req.params.id },
    data: updateData,
  });
  res.json({ success: true, data: category });
}));

// DELETE /api/categories/:id (admin only)
router.delete('/:id', protect, authorise('admin'), asyncHandler(async (req, res) => {
  await prisma.category.delete({
    where: { id: req.params.id },
  });
  res.json({ success: true, message: 'Category deleted' });
}));

module.exports = router;
