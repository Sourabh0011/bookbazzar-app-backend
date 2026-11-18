const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const { prisma } = require('../../config/prisma');
const { protect, asyncHandler } = require('../../middleware/auth.middleware');

// GET /api/users/profile
router.get('/profile', protect, asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      role: true,
      profileImage: true,
      isVerified: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      addresses: true,
    },
  });

  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  res.json({
    success: true,
    data: {
      ...user,
      name: user.fullName,
      role: user.role.toLowerCase(),
    },
  });
}));

// PUT /api/users/profile
router.put('/profile', protect, asyncHandler(async (req, res) => {
  const { fullName, name, phone, profileImage } = req.body;
  const updateData = {};
  const newName = (fullName || name || '').trim();
  if (newName) updateData.fullName = newName;
  if (phone !== undefined) updateData.phone = phone ? phone.trim() : null;
  if (profileImage !== undefined) updateData.profileImage = profileImage;

  const updated = await prisma.user.update({
    where: { id: req.user.id },
    data: updateData,
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      role: true,
      profileImage: true,
    },
  });

  res.json({
    success: true,
    data: {
      ...updated,
      name: updated.fullName,
      role: updated.role.toLowerCase(),
    },
  });
}));

// PUT /api/users/change-password
router.put('/change-password', protect, asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ success: false, message: 'Current and new password are required' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
  }

  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });

  const isMatch = await bcrypt.compare(currentPassword, user.password);
  if (!isMatch) {
    return res.status(400).json({ success: false, message: 'Incorrect current password' });
  }

  const hashedPassword = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: req.user.id },
    data: { password: hashedPassword },
  });

  res.json({ success: true, message: 'Password updated successfully' });
}));

// ─── Addresses CRUD ──────────────────────────────────────────────────────────

// GET /api/users/addresses
router.get('/addresses', protect, asyncHandler(async (req, res) => {
  const addresses = await prisma.address.findMany({
    where: { userId: req.user.id },
    orderBy: { isDefault: 'desc' },
  });
  res.json({ success: true, data: addresses });
}));

// POST /api/users/addresses
router.post('/addresses', protect, asyncHandler(async (req, res) => {
  const { fullName, phone, addressLine, city, state, postalCode, isDefault } = req.body;

  if (!fullName || !phone || !addressLine || !city || !state || !postalCode) {
    return res.status(400).json({ success: false, message: 'All address fields are required' });
  }

  const makeDefault = Boolean(isDefault);

  // If new address is default, reset existing defaults
  if (makeDefault) {
    await prisma.address.updateMany({
      where: { userId: req.user.id },
      data: { isDefault: false },
    });
  }

  const address = await prisma.address.create({
    data: {
      userId: req.user.id,
      fullName: fullName.trim(),
      phone: phone.trim(),
      addressLine: addressLine.trim(),
      city: city.trim(),
      state: state.trim(),
      postalCode: postalCode.trim(),
      isDefault: makeDefault,
    },
  });

  res.status(201).json({ success: true, data: address });
}));

// PUT /api/users/addresses/:id
router.put('/addresses/:id', protect, asyncHandler(async (req, res) => {
  const address = await prisma.address.findUnique({ where: { id: req.params.id } });
  if (!address || address.userId !== req.user.id) {
    return res.status(404).json({ success: false, message: 'Address not found' });
  }

  const { fullName, phone, addressLine, city, state, postalCode, isDefault } = req.body;
  if (isDefault) {
    await prisma.address.updateMany({
      where: { userId: req.user.id },
      data: { isDefault: false },
    });
  }

  const updated = await prisma.address.update({
    where: { id: req.params.id },
    data: {
      ...(fullName && { fullName: fullName.trim() }),
      ...(phone && { phone: phone.trim() }),
      ...(addressLine && { addressLine: addressLine.trim() }),
      ...(city && { city: city.trim() }),
      ...(state && { state: state.trim() }),
      ...(postalCode && { postalCode: postalCode.trim() }),
      ...(isDefault !== undefined && { isDefault: Boolean(isDefault) }),
    },
  });

  res.json({ success: true, data: updated });
}));

// DELETE /api/users/addresses/:id
router.delete('/addresses/:id', protect, asyncHandler(async (req, res) => {
  const address = await prisma.address.findUnique({ where: { id: req.params.id } });
  if (!address || address.userId !== req.user.id) {
    return res.status(404).json({ success: false, message: 'Address not found' });
  }

  await prisma.address.delete({ where: { id: req.params.id } });
  res.json({ success: true, message: 'Address deleted' });
}));

module.exports = router;
