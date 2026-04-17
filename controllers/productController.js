const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const Product = require('../models/Product');

const normalizeMediaUrls = (mediaUrls = []) => {
  const backendHost = process.env.BACKEND_URL || 'https://shafiqcards-backend.onrender.com';
  const placeholderImage = 'https://via.placeholder.com/400x400?text=Image+Not+Available';
  
  return mediaUrls.map((url) => {
    if (!url || typeof url !== 'string') return placeholderImage;
    
    // If it's a local URL, it's likely broken (files were deleted)
    if (url.includes('localhost:5000/uploads') || url.includes('/uploads/')) {
      console.warn(`⚠️ Broken local URL detected: ${url}`);
      return placeholderImage;
    }
    
    // Normalize localhost to backendHost
    if (url.startsWith('http://localhost:5000')) {
      return url.replace('http://localhost:5000', backendHost);
    }
    
    return url;
  });
};

const parseKeywords = (keywords) => {
  if (Array.isArray(keywords)) {
    return Array.from(new Set(keywords.map((keyword) => String(keyword).trim().toLowerCase()).filter(Boolean)));
  }
  if (!keywords) return [];
  return Array.from(new Set(String(keywords)
    .split(',')
    .map((keyword) => keyword.trim().toLowerCase())
    .filter(Boolean)));
};

const validateKeywordCount = (keywords = []) => {
  return Array.isArray(keywords) && keywords.length >= 2 && keywords.length <= 10;
};

const normalizeSearchToken = (token = '') => {
  let normalized = String(token).toLowerCase().replace(/[^a-z0-9]/g, '').trim();
  if (!normalized) return '';

  if (normalized.length > 4) {
    if (normalized.endsWith('ing')) normalized = normalized.slice(0, -3);
    else if (normalized.endsWith('able')) normalized = normalized.slice(0, -4);
    else if (normalized.endsWith('ed')) normalized = normalized.slice(0, -2);
  }

  if (normalized.length > 2 && normalized.endsWith('s') && !normalized.endsWith('ss')) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
};

const buildSearchTokens = (search = '') => {
  const stopwords = new Set([
    'i', 'me', 'you', 'we', 'they', 'he', 'she', 'it', 'the', 'a', 'an', 'and', 'or', 'for', 'to', 'of', 'with',
    'on', 'in', 'at', 'by', 'from', 'want', 'wanting', 'looking', 'please', 'need', 'give', 'show', 'can', 'could',
    'would', 'should', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had'
  ]);

  return String(search)
    .toLowerCase()
    .split(/[\s,.;:!?]+/)
    .map(normalizeSearchToken)
    .filter(Boolean)
    .filter((term) => !stopwords.has(term));
};

const buildSearchVariants = (token = '') => {
  const variants = new Set([token]);
  if (!token) return [];

  if (token.includes('scroll') && token.includes('card')) {
    variants.add('scroll');
    variants.add('card');
    variants.add('cards');
    variants.add('scrollable');
    variants.add('scrolling');
  }
  if (token.includes('scrollable')) {
    variants.add('scroll');
    variants.add('scrolling');
  }
  if (token.includes('scrolling')) {
    variants.add('scroll');
    variants.add('scrollable');
  }
  if (token.includes('cards')) {
    variants.add('card');
  }
  if (token.includes('invite')) {
    variants.add('invitation');
  }
  if (token.includes('envelop')) {
    variants.add('envelope');
  }

  return Array.from(variants);
};

const buildSearchRegex = (term = '') => {
  const safeTerm = escapeRegExp(String(term));
  return new RegExp(`\\b${safeTerm}[a-z]*\\b`, 'i');
};

const escapeRegExp = (value = '') => {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const verifyAdminRequest = async (req) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const admin = await Admin.findById(decoded.id).select('-password');
    return !!admin;
  } catch (err) {
    return false;
  }
};

// -------------------------------------------------------
// @desc    Create a new product (with media upload)
// @route   POST /api/products
// @access  Private (admin only)
// -------------------------------------------------------
// -------------------------------------------------------
// @desc    Create a new product (with media upload)
// @route   POST /api/products
// @access  Private (admin only)
// -------------------------------------------------------
const createProduct = async (req, res) => {
  const rawTitle = typeof req.body.title === 'string' ? req.body.title.trim() : '';
  const { category, description, price, isActive, adminNote, keywords } = req.body;
  const rawAdminNote = typeof adminNote === 'string' ? adminNote.trim() : '';
  const parsedKeywords = parseKeywords(keywords);

  if (!validateKeywordCount(parsedKeywords)) {
    return res.status(400).json({
      success: false,
      message: 'Please provide between 2 and 10 keywords, separated by commas.',
    });
  }

  // Validate required fields
  if (!category) {
    return res.status(400).json({
      success: false,
      message: 'Category is required.',
    });
  }

  // Validate category enum
  const validCategories = ['invitation', 'envelope', 'box', 'reel'];
  if (!validCategories.includes(category.toLowerCase())) {
    return res.status(400).json({
      success: false,
      message: `Invalid category. Must be one of: ${validCategories.join(', ')}`,
    });
  }

  // Check that at least one file was uploaded
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'At least one media file is required.',
    });
  }

  // Create URLs based on storage type
  let mediaUrls;
  const useCloudinary = process.env.CLOUDINARY_CLOUD_NAME &&
                       process.env.CLOUDINARY_API_KEY &&
                       process.env.CLOUDINARY_API_SECRET &&
                       process.env.CLOUDINARY_CLOUD_NAME !== 'your_cloud_name';

  if (useCloudinary) {
    // Cloudinary provides direct URLs and public_ids
    mediaUrls = req.files.map((file) => file.path); // Cloudinary provides optimized URLs
  } else {
    // Create URLs pointing to the local static uploads folder
    mediaUrls = req.files.map((f) => `${req.protocol}://${req.get('host')}/uploads/${f.filename}`);
  }

  const mediaPublicIds = useCloudinary ? req.files.map((file) => file.filename) : []; // Store public_ids for Cloudinary

  const rawPrice = price === '' || price === undefined ? null : String(price).trim();
  if (rawPrice !== null && rawPrice !== '' && !/^[\d,]+$/.test(rawPrice)) {
    return res.status(400).json({
      success: false,
      message: 'Price must contain only digits and commas.',
    });
  }

  const product = await Product.create({
    title: rawTitle,
    category: category.toLowerCase(),
    description: description || '',
    adminNote: rawAdminNote,
    keywords: parsedKeywords,
    price: rawPrice && rawPrice !== '' ? rawPrice : null,
    mediaUrls,
    mediaPublicIds,
    isActive: isActive !== undefined ? (isActive === 'true' || isActive === true) : true,
  });

  return res.status(201).json({
    success: true,
    message: 'Product created successfully.',
    data: { product },
  });
};

// -------------------------------------------------------
// @desc    Get all products (optionally filter by category)
// @route   GET /api/products?category=invitation
// @access  Public
// -------------------------------------------------------
const getProducts = async (req, res) => {
  const { category, page = 1, limit = 20, admin, search } = req.query;
  const isAdminRequest = admin === 'true' && await verifyAdminRequest(req);

  const filter = isAdminRequest ? {} : { isActive: { $ne: false } };
  if (search && String(search).trim()) {
    const searchTokens = buildSearchTokens(search);
    if (searchTokens.length) {
      filter.$and = searchTokens.map((token) => {
        const variants = buildSearchVariants(token);
        return {
          $or: variants.flatMap((variant) => [
            { title: buildSearchRegex(variant) },
            { description: buildSearchRegex(variant) },
            { keywords: buildSearchRegex(variant) }
          ])
        };
      });
    }
  }
  if (category) {
    const validCategories = ['invitation', 'envelope', 'box', 'reel'];
    if (!validCategories.includes(category.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: `Invalid category. Must be one of: ${validCategories.join(', ')}`,
      });
    }
    filter.category = category.toLowerCase();
  }

  const skip = (Number(page) - 1) * Number(limit);
  const total = await Product.countDocuments(filter);
  const products = await Product.find(filter)
    .sort({ createdAt: -1 }) // newest first
    .skip(skip)
    .limit(Number(limit));

  const normalizedProducts = products.map((product) => {
    const obj = product.toObject ? product.toObject() : { ...product };
    obj.mediaUrls = normalizeMediaUrls(obj.mediaUrls);
    if (!isAdminRequest) {
      delete obj.adminNote;
    }
    return obj;
  });

  return res.status(200).json({
    success: true,
    data: {
      products: normalizedProducts,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    },
  });
};

// -------------------------------------------------------
// @desc    Get products by category (URL param)
// @route   GET /api/products/category/:category
// @access  Public
// -------------------------------------------------------
const getProductsByCategory = async (req, res) => {
  const { category } = req.params;
  const { page = 1, limit = 20, admin, search } = req.query;

  const validCategories = ['invitation', 'envelope', 'box', 'reel'];
  if (!validCategories.includes(category.toLowerCase())) {
    return res.status(400).json({
      success: false,
      message: `Invalid category. Must be one of: ${validCategories.join(', ')}`,
    });
  }

  const isAdminRequest = admin === 'true' && await verifyAdminRequest(req);
  const filter = { category: category.toLowerCase() };
  if (!isAdminRequest) {
     filter.isActive = { $ne: false };
  }
  if (search && String(search).trim()) {
    const searchTokens = buildSearchTokens(search);
    if (searchTokens.length) {
      filter.$and = searchTokens.map((token) => {
        const variants = buildSearchVariants(token);
        return {
          $or: variants.flatMap((variant) => [
            { title: buildSearchRegex(variant) },
            { description: buildSearchRegex(variant) },
            { keywords: buildSearchRegex(variant) }
          ])
        };
      });
    }
  }
  
  const skip = (Number(page) - 1) * Number(limit);
  const total = await Product.countDocuments(filter);
  const products = await Product.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(Number(limit));

  const normalizedProducts = products.map((product) => {
    const obj = product.toObject ? product.toObject() : { ...product };
    obj.mediaUrls = normalizeMediaUrls(obj.mediaUrls);
    if (!isAdminRequest) {
      delete obj.adminNote;
    }
    return obj;
  });

  return res.status(200).json({
    success: true,
    data: {
      category: category.toLowerCase(),
      products: normalizedProducts,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / Number(limit)),
      },
    },
  });
};

// -------------------------------------------------------
// @desc    Get single product by ID
// @route   GET /api/products/:id
// @access  Public
// -------------------------------------------------------
const getProductById = async (req, res) => {
  const { admin } = req.query;
  const isAdminRequest = admin === 'true' && await verifyAdminRequest(req);
  const product = await Product.findById(req.params.id);

  if (!product || (product.isActive === false && !isAdminRequest)) {
    return res.status(404).json({
      success: false,
      message: 'Product not found.',
    });
  }

  const normalizedProduct = product.toObject ? product.toObject() : { ...product };
  normalizedProduct.mediaUrls = normalizeMediaUrls(normalizedProduct.mediaUrls);
  if (!isAdminRequest) {
    delete normalizedProduct.adminNote;
  }

  return res.status(200).json({
    success: true,
    data: { product: normalizedProduct },
  });
};

// -------------------------------------------------------
// @desc    Delete a product (hard delete)
// @route   DELETE /api/products/:id
// @access  Private (admin only)
// -------------------------------------------------------
const deleteProduct = async (req, res) => {
  const product = await Product.findById(req.params.id);

  if (!product) {
    return res.status(404).json({
      success: false,
      message: 'Product not found.',
    });
  }

  // Hard delete the product
  await Product.findByIdAndDelete(req.params.id);

  return res.status(200).json({
    success: true,
    message: 'Product deleted successfully.',
  });
};

// -------------------------------------------------------
// @desc    Update a product
// @route   PUT /api/products/:id
// @access  Private (admin only)
// -------------------------------------------------------
const updateProduct = async (req, res) => {
  const { title, category, description, price, isActive, adminNote, keywords } = req.body;
  
  let product = await Product.findById(req.params.id);

  if (!product) {
    return res.status(404).json({
      success: false,
      message: 'Product not found.',
    });
  }

  // Update fields if provided
  if (title !== undefined) product.title = title;
  if (category) {
    const validCategories = ['invitation', 'envelope', 'box', 'reel'];
    if (!validCategories.includes(category.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: `Invalid category. Must be one of: ${validCategories.join(', ')}`,
      });
    }
    product.category = category.toLowerCase();
  }
  if (description !== undefined) product.description = description;
  if (adminNote !== undefined) product.adminNote = adminNote;
  if (keywords !== undefined) {
    const parsedKeywords = parseKeywords(keywords);
    if (!validateKeywordCount(parsedKeywords)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide between 2 and 10 keywords, separated by commas.',
      });
    }
    product.keywords = parsedKeywords;
  }
  if (price !== undefined) {
    const rawPrice = price === '' ? null : String(price).trim();
    if (rawPrice !== null && rawPrice !== '' && !/^[\d,]+$/.test(rawPrice)) {
      return res.status(400).json({
        success: false,
        message: 'Price must contain only digits and commas.',
      });
    }
    product.price = rawPrice && rawPrice !== '' ? rawPrice : null;
  }
  if (isActive !== undefined) product.isActive = (isActive === 'true' || isActive === true);

  // Handle media updates
  if (req.body.mediaUrls) {
    // Use the provided mediaUrls array (for removing specific media)
    try {
      const updatedMediaUrls = JSON.parse(req.body.mediaUrls);
      product.mediaUrls = updatedMediaUrls;
    } catch (err) {
      return res.status(400).json({
        success: false,
        message: 'Invalid mediaUrls format.',
      });
    }
  }

  // Handle new media if uploaded
  if (req.files && req.files.length > 0) {
    const useCloudinary = process.env.CLOUDINARY_CLOUD_NAME &&
                         process.env.CLOUDINARY_API_KEY &&
                         process.env.CLOUDINARY_API_SECRET &&
                         process.env.CLOUDINARY_CLOUD_NAME !== 'your_cloud_name';

    let newMediaUrls;
    if (useCloudinary) {
      // Cloudinary provides direct URLs
      newMediaUrls = req.files.map((file) => file.path);
    } else {
      // Create URLs pointing to the local static uploads folder
      newMediaUrls = req.files.map((f) => `${req.protocol}://${req.get('host')}/uploads/${f.filename}`);
    }

    // Append new media to existing
    product.mediaUrls = [...product.mediaUrls, ...newMediaUrls];
  }

  // Validate that we have at least one media URL
  if (!product.mediaUrls || product.mediaUrls.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'At least one media file is required.',
    });
  }

  await product.save();

  return res.status(200).json({
    success: true,
    message: 'Product updated successfully.',
    data: { product },
  });
};

module.exports = {
  createProduct,
  getProducts,
  getProductsByCategory,
  getProductById,
  deleteProduct,
  updateProduct,
};
