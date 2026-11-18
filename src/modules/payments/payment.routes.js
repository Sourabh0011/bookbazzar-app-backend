const express = require('express');
const router  = express.Router();
const Razorpay = require('razorpay');
const crypto  = require('crypto');
const { prisma } = require('../../config/prisma');
const { protect, asyncHandler } = require('../../middleware/auth.middleware');

const getRazorpay = () =>
  new Razorpay({
    key_id:     process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholder',
    key_secret: process.env.RAZORPAY_KEY_SECRET || 'rzp_secret_placeholder',
  });

// POST /api/payments/create-order
router.post('/create-order', protect, asyncHandler(async (req, res) => {
  const { orderId } = req.body;
  if (!orderId) return res.status(400).json({ success: false, message: 'orderId is required' });

  const order = await prisma.order.findUnique({
    where: { id: orderId },
  });
  if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

  if (order.buyerId !== req.user.id) {
    return res.status(403).json({ success: false, message: 'Not authorised to pay for this order' });
  }

  if (order.paymentStatus === 'PAID') {
    return res.status(400).json({ success: false, message: 'Order already paid' });
  }

  const razorpay = getRazorpay();
  const totalAmount = parseFloat(order.totalAmount) + parseFloat(order.shippingAmount || 0);

  const rzpOrder = await razorpay.orders.create({
    amount:   Math.round(totalAmount * 100), // paise
    currency: 'INR',
    receipt:  orderId,
  });

  res.json({
    success:         true,
    razorpayOrderId: rzpOrder.id,
    amount:          rzpOrder.amount,
    currency:        rzpOrder.currency,
    keyId:           process.env.RAZORPAY_KEY_ID,
  });
}));

// POST /api/payments/verify
router.post('/verify', protect, asyncHandler(async (req, res) => {
  const { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

  if (!orderId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    return res.status(400).json({ success: false, message: 'Missing payment verification fields' });
  }

  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || 'rzp_secret_placeholder')
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex');

  if (expectedSignature !== razorpaySignature) {
    return res.status(400).json({ success: false, message: 'Payment verification failed: invalid signature' });
  }

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

  // Update order and record payment in transaction
  const totalAmount = parseFloat(order.totalAmount) + parseFloat(order.shippingAmount || 0);
  await prisma.$transaction([
    prisma.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: 'PAID',
        status: 'CONFIRMED',
      },
    }),
    prisma.payment.create({
      data: {
        orderId,
        paymentMethod: 'RAZORPAY',
        transactionId: razorpayPaymentId,
        amount: totalAmount,
        status: 'SUCCESS',
      },
    }),
  ]);

  res.json({ success: true, message: 'Payment verified and order confirmed' });
}));

module.exports = router;
