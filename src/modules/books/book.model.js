const mongoose = require('mongoose');

const bookSchema = new mongoose.Schema(
  {
    title: {
      type:     String,
      required: [true, 'Book title is required'],
      trim:     true,
      maxlength: [200, 'Title must be at most 200 characters'],
    },
    author: {
      type:     String,
      required: [true, 'Author name is required'],
      trim:     true,
      maxlength: [120, 'Author name must be at most 120 characters'],
    },
    description: {
      type:      String,
      required:  [true, 'Description is required'],
      maxlength: [2000, 'Description must be at most 2000 characters'],
    },
    price: {
      type:    Number,
      required: [true, 'Price is required'],
      min:     [0, 'Price cannot be negative'],
    },
    originalPrice: {
      type:    Number,
      min:     [0, 'Original price cannot be negative'],
    },
    condition: {
      type:     String,
      required: [true, 'Condition is required'],
      enum:     ['like_new', 'good', 'fair', 'acceptable'],
    },
    category: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Category',
      required: [true, 'Category is required'],
    },
    seller: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: [true, 'Seller is required'],
    },
    images: [
      {
        url:      { type: String, required: true },
        publicId: { type: String, required: true },
      },
    ],
    subject:  { type: String, trim: true, default: '' },
    isbn:     { type: String, trim: true, default: '' },
    edition:  { type: String, trim: true, default: '' },
    language: { type: String, default: 'English' },
    tags:     [{ type: String, lowercase: true, trim: true }],
    status: {
      type:    String,
      enum:    ['active', 'sold', 'inactive'],
      default: 'active',
    },
    views:     { type: Number, default: 0 },
    isFeatured: { type: Boolean, default: false },
    location:  { type: String, default: '' },
  },
  { timestamps: true }
);

// Full-text search index
bookSchema.index({ title: 'text', author: 'text', description: 'text', tags: 'text' });
// Performance indexes
bookSchema.index({ seller: 1, status: 1 });
bookSchema.index({ category: 1, status: 1 });
bookSchema.index({ price: 1 });

module.exports = mongoose.model('Book', bookSchema);
