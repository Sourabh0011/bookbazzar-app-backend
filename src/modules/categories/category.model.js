const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema(
  {
    name: {
      type:     String,
      required: [true, 'Category name is required'],
      unique:   true,
      trim:     true,
      maxlength: [60, 'Category name must be at most 60 characters'],
    },
    slug: {
      type:   String,
      unique: true,
      lowercase: true,
    },
    description: { type: String, default: '' },
    icon:        { type: String, default: '' },   // emoji or icon class
    image: {
      url:      { type: String, default: '' },
      publicId: { type: String, default: '' },
    },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Auto-generate slug from name
categorySchema.pre('save', function (next) {
  if (this.isModified('name')) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
  next();
});

module.exports = mongoose.model('Category', categorySchema);
