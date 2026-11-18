const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { prisma } = require('../../config/prisma');
const { asyncHandler } = require('../../middleware/auth.middleware');

// ─── Helpers ────────────────────────────────────────────────────────────────

const signAccessToken = (id, role) =>
  jwt.sign({ id, role }, process.env.JWT_SECRET || 'bookbazzar_jwt_secret_dev_2026', {
    expiresIn: process.env.JWT_EXPIRES_IN || '30d',
  });

const signRefreshToken = (id) =>
  jwt.sign({ id }, process.env.JWT_REFRESH_SECRET || 'bookbazzar_jwt_refresh_dev_2026', {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '90d',
  });

const sendTokens = (res, user, statusCode = 200) => {
  const normalizedRole = (user.role || 'BUYER').toLowerCase();
  const accessToken = signAccessToken(user.id, normalizedRole);
  const refreshToken = signRefreshToken(user.id);

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });

  res.status(statusCode).json({
    success: true,
    accessToken,
    user: {
      id: user.id,
      name: user.fullName,
      fullName: user.fullName,
      email: user.email,
      role: normalizedRole,
      profileImage: user.profileImage || null,
      avatar: user.profileImage || null,
      phone: user.phone || null,
    },
  });
};

// ─── Controllers ─────────────────────────────────────────────────────────────

/**
 * POST /api/auth/register
 */
exports.register = asyncHandler(async (req, res) => {
  const { name, fullName, email, password, role, phone } = req.body;
  const displayName = (fullName || name || '').trim();
  const normalizedEmail = (email || '').trim().toLowerCase();

  if (!displayName) {
    return res.status(400).json({ success: false, message: 'Name is required' });
  }
  if (!normalizedEmail) {
    return res.status(400).json({ success: false, message: 'Email is required' });
  }
  if (!password || password.length < 6) {
    return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
  }

  // Check if email already in use
  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });
  if (existing) {
    return res.status(409).json({ success: false, message: 'Email already registered' });
  }

  // Parse role safely
  let userRole = 'BUYER';
  if (role && typeof role === 'string') {
    const r = role.trim().toUpperCase();
    if (r === 'SELLER') userRole = 'SELLER';
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: {
      fullName: displayName,
      email: normalizedEmail,
      phone: phone || null,
      password: hashedPassword,
      role: userRole,
    },
  });

  // Automatically create empty cart for new user
  try {
    await prisma.cart.create({
      data: { userId: user.id },
    });
  } catch (err) {
    console.warn(`Could not create initial cart for user ${user.id}: ${err.message}`);
  }

  sendTokens(res, user, 201);
});

/**
 * POST /api/auth/login
 */
exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const normalizedEmail = (email || '').trim().toLowerCase();

  if (!normalizedEmail || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required' });
  }

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (!user) {
    return res.status(401).json({ success: false, message: 'Invalid email or password' });
  }

  if (!user.isActive) {
    return res.status(403).json({ success: false, message: 'Account has been deactivated' });
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    return res.status(401).json({ success: false, message: 'Invalid email or password' });
  }

  sendTokens(res, user, 200);
});

/**
 * POST /api/auth/refresh
 */
exports.refreshToken = asyncHandler(async (req, res) => {
  const token = req.cookies?.refreshToken;
  if (!token) {
    return res.status(401).json({ success: false, message: 'No refresh token' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET || 'bookbazzar_jwt_refresh_dev_2026');
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
    });
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'User not found or inactive' });
    }
    sendTokens(res, user);
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
  }
});

/**
 * POST /api/auth/logout
 */
exports.logout = asyncHandler(async (req, res) => {
  res.clearCookie('refreshToken');
  res.status(200).json({ success: true, message: 'Logged out successfully' });
});

/**
 * GET /api/auth/me
 */
exports.getMe = asyncHandler(async (req, res) => {
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
    },
  });

  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  const normalizedRole = user.role.toLowerCase();
  res.status(200).json({
    success: true,
    data: {
      ...user,
      name: user.fullName,
      role: normalizedRole,
    },
  });
});
