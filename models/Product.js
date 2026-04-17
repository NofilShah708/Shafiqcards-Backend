const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
      default: '',
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
      enum: {
        values: ['invitation', 'envelope', 'box', 'reel'],
        message: 'Category must be one of: invitation, envelope, box, reel',
      },
      lowercase: true,
    },
    mediaUrls: {
      type: [String],
      validate: {
        validator: (arr) => arr.length > 0,
        message: 'At least one media URL is required',
      },
    },
    // Optional: Cloudinary public_ids for deletion support
    mediaPublicIds: {
      type: [String],
      default: [],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [1000, 'Description cannot exceed 1000 characters'],
      default: '',
    },
    adminNote: {
      type: String,
      trim: true,
      maxlength: [1000, 'Admin note cannot exceed 1000 characters'],
      default: '',
    },
    keywords: {
      type: [String],
      default: [],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.every((item) => typeof item === 'string' && item.trim().length > 0),
        message: 'Keywords must be a list of non-empty strings',
      },
    },
    price: {
      type: String,
      trim: true,
      maxlength: [20, 'Price cannot exceed 20 characters'],
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true, // soft delete support
    },
  },
  {
    timestamps: true,
  }
);

// Index category for fast category-based queries
productSchema.index({ category: 1 });
// Index keywords for fast keyword filtering
productSchema.index({ keywords: 1 });
// Index createdAt descending so newest products appear first by default
productSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Product', productSchema);
