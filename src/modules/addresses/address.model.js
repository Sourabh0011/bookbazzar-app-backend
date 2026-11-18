const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema(
  {
    user:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    label:       { type: String, default: 'Home', trim: true },   // Home / Work / Other
    fullName:    { type: String, required: true, trim: true },
    phone:       { type: String, required: true, trim: true },
    addressLine1:{ type: String, required: true, trim: true },
    addressLine2:{ type: String, default: '', trim: true },
    city:        { type: String, required: true, trim: true },
    state:       { type: String, required: true, trim: true },
    pincode:     { type: String, required: true, trim: true },
    country:     { type: String, default: 'India' },
    isDefault:   { type: Boolean, default: false },
  },
  { timestamps: true }
);

addressSchema.index({ user: 1 });

module.exports = mongoose.model('Address', addressSchema);
