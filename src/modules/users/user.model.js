const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: {
      type:     String,
      required: [true, 'Name is required'],
      trim:     true,
      maxlength: [80, 'Name must be at most 80 characters'],
    },
    email: {
      type:      String,
      required:  [true, 'Email is required'],
      unique:    true,
      lowercase: true,
      trim:      true,
      match:     [/^\S+@\S+\.\S+$/, 'Please enter a valid email'],
    },
    password: {
      type:      String,
      required:  [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select:    false,   // never returned in queries by default
    },
    role: {
      type:    String,
      enum:    ['buyer', 'seller', 'admin'],
      default: 'buyer',
    },
    avatar: {
      url:      { type: String, default: '' },
      publicId: { type: String, default: '' },
    },
    phone: {
      type:  String,
      trim:  true,
      default: '',
    },
    isEmailVerified: {
      type:    Boolean,
      default: false,
    },
    isActive: {
      type:    Boolean,
      default: true,
    },
    // Seller-specific fields
    sellerProfile: {
      bio:          { type: String, default: '' },
      collegeOrUniversity: { type: String, default: '' },
      totalSales:   { type: Number, default: 0 },
      rating:       { type: Number, default: 0, min: 0, max: 5 },
      ratingCount:  { type: Number, default: 0 },
    },
    // Password reset
    passwordResetToken:   { type: String, select: false },
    passwordResetExpires: { type: Date,   select: false },

    refreshToken: { type: String, select: false },
  },
  { timestamps: true }
);

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare plain password with stored hash
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
