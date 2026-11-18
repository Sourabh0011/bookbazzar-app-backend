const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema(
  {
    buyer: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: true,
    },
    items: [
      {
        book:        { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true },
        seller:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        title:       { type: String, required: true },
        price:       { type: Number, required: true },
        quantity:    { type: Number, required: true, default: 1 },
        image:       { type: String, default: '' },
        // snapshot of condition at time of order
        condition:   { type: String, default: '' },
      },
    ],
    shippingAddress: {
      fullName:   { type: String, required: true },
      phone:      { type: String, required: true },
      addressLine1: { type: String, required: true },
      addressLine2: { type: String, default: '' },
      city:       { type: String, required: true },
      state:      { type: String, required: true },
      pincode:    { type: String, required: true },
      country:    { type: String, default: 'India' },
    },
    totalAmount:    { type: Number, required: true },
    deliveryCharge: { type: Number, default: 0 },
    discount:       { type: Number, default: 0 },
    finalAmount:    { type: Number, required: true },

    paymentStatus: {
      type:    String,
      enum:    ['pending', 'paid', 'failed', 'refunded'],
      default: 'pending',
    },
    paymentMethod: {
      type:    String,
      enum:    ['razorpay', 'cod'],
      default: 'razorpay',
    },
    razorpayOrderId:   { type: String, default: '' },
    razorpayPaymentId: { type: String, default: '' },
    razorpaySignature: { type: String, select: false },

    orderStatus: {
      type:    String,
      enum:    ['placed', 'confirmed', 'shipped', 'delivered', 'cancelled', 'returned'],
      default: 'placed',
    },
    trackingNumber: { type: String, default: '' },
    notes:          { type: String, default: '' },
  },
  { timestamps: true }
);

orderSchema.index({ buyer: 1, createdAt: -1 });

module.exports = mongoose.model('Order', orderSchema);
