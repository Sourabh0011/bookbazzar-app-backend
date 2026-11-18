const jwt = require('jsonwebtoken');

/**
 * Global async error handler – wraps route handlers so we don't need
 * try/catch in every controller.
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Authentication middleware – verifies the JWT access token from the
 * Authorization: Bearer <token> header.
 */
const protect = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Not authorised – no token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'bookbazzar_jwt_secret_dev_2026');
    req.user = { id: decoded.id, role: (decoded.role || '').toLowerCase() };
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Not authorised – token invalid or expired' });
  }
});

/**
 * Role-based access control middleware factory.
 * Usage: authorise('admin'), authorise('seller', 'admin')
 */
const authorise = (...roles) => (req, res, next) => {
  const userRole = (req.user?.role || '').toLowerCase();
  const allowed = roles.map((r) => r.toLowerCase());

  if (!allowed.includes(userRole)) {
    return res.status(403).json({
      success: false,
      message: `Role '${req.user?.role}' is not permitted to access this resource`,
    });
  }
  next();
};

module.exports = { protect, authorise, asyncHandler };
