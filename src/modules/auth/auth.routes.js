const express  = require('express');
const { body } = require('express-validator');
const router   = express.Router();

const authController = require('./auth.controller');
const { protect }    = require('../../middleware/auth.middleware');
const validate       = require('../../middleware/validate.middleware');

// Register
router.post(
  '/register',
  [
    body('email').normalizeEmail().isEmail().withMessage('Valid email required'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('name')
      .optional()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Name must be between 2 and 100 characters'),
    body('fullName')
      .optional()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Full name must be between 2 and 100 characters'),
    body('phone')
      .optional()
      .trim(),
    body('role')
      .optional()
      .custom((value) => {
        if (!value) return true;
        const normalized = value.toLowerCase();
        if (!['buyer', 'seller'].includes(normalized)) {
          throw new Error('Role must be buyer or seller');
        }
        return true;
      }),
  ],
  validate,
  authController.register
);

// Login
router.post(
  '/login',
  [
    body('email').normalizeEmail().isEmail().withMessage('Valid email required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  validate,
  authController.login
);

// Refresh access token
router.post('/refresh', authController.refreshToken);

// Logout
router.post('/logout', authController.logout);

// Get authenticated user
router.get('/me', protect, authController.getMe);

module.exports = router;
