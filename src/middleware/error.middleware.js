/**
 * Global error-handling middleware.
 * Must be registered AFTER all routes.
 */
const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message    = err.message    || 'Internal Server Error';

  // Prisma unique constraint violation (e.g. unique email)
  if (err.code === 'P2002') {
    statusCode = 409;
    const target = Array.isArray(err.meta?.target) ? err.meta.target.join(', ') : err.meta?.target || 'field';
    message = `Duplicate value for unique field: ${target}`;
  }

  // Prisma record not found
  if (err.code === 'P2025') {
    statusCode = 404;
    message = err.meta?.cause || 'Requested record not found';
  }

  // Prisma foreign key constraint violation
  if (err.code === 'P2003') {
    statusCode = 400;
    message = `Foreign key constraint failed on field: ${err.meta?.field_name || 'unknown'}`;
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

module.exports = errorHandler;
