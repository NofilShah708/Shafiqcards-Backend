const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/authMiddleware');
const upload = require('../utils/multer');
const {
  createProduct,
  getProducts,
  getProductsByCategory,
  getProductById,
  deleteProduct,
  updateProduct,
} = require('../controllers/productController');

// -------------------------------------------------------
// Public Routes
// -------------------------------------------------------

// GET /api/products            — all products (optional ?category=)
router.get('/', getProducts);

// GET /api/products/category/:category
router.get('/category/:category', getProductsByCategory);

// GET /api/products/:id
router.get('/:id', getProductById);

// -------------------------------------------------------
// Protected Routes (Admin only)
// -------------------------------------------------------

// POST /api/products           — create product with media files
// 'media' is the form-data field name for uploaded files (max 10 files)
router.post(
  '/',
  authMiddleware,
  upload.array('media', 10),
  createProduct
);

// DELETE /api/products/:id     — hard delete
router.delete('/:id', authMiddleware, deleteProduct);

// PUT /api/products/:id        — update product
router.put('/:id', authMiddleware, upload.array('media', 10), updateProduct);

module.exports = router;
