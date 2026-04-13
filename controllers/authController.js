const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');

// -------------------------------------------------------
// Helper: generate a signed JWT
// -------------------------------------------------------
const generateToken = (id) => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured. Set JWT_SECRET in .env before starting the server.');
  }

  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

// -------------------------------------------------------
// @desc    Register a new admin
// @route   POST /api/admin/register
// @access  Public (should be locked down in production
//          after first admin is created)
// -------------------------------------------------------
const register = async (req, res) => {
  const { email, password } = req.body;

  // Basic validation
  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Email and password are required.',
    });
  }

  // Check if admin already exists
  const exists = await Admin.findOne({ email: email.toLowerCase() });
  if (exists) {
    return res.status(409).json({
      success: false,
      message: 'Admin with this email already exists.',
    });
  }

  // Create admin — password is hashed by the pre-save hook in the model
  const admin = await Admin.create({ email, password });

  return res.status(201).json({
    success: true,
    message: 'Admin registered successfully.',
    data: {
      id: admin._id,
      email: admin.email,
      createdAt: admin.createdAt,
    },
  });
};

// -------------------------------------------------------
// @desc    Login admin and return JWT
// @route   POST /api/admin/login
// @access  Public
// -------------------------------------------------------
const login = async (req, res) => {
  const { email, password } = req.body;

  // Basic validation
  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Email and password are required.',
    });
  }

  // Find admin — explicitly select password (excluded by default)
  const admin = await Admin.findOne({ email: email.toLowerCase() }).select(
    '+password'
  );

  if (!admin) {
    return res.status(401).json({
      success: false,
      message: 'Invalid email or password.',
    });
  }

  // Compare passwords
  const isMatch = await admin.matchPassword(password);
  if (!isMatch) {
    return res.status(401).json({
      success: false,
      message: 'Invalid email or password.',
    });
  }

  const token = generateToken(admin._id);

  return res.status(200).json({
    success: true,
    message: 'Login successful.',
    data: {
      token,
      admin: {
        id: admin._id,
        email: admin.email,
      },
    },
  });
};

// -------------------------------------------------------
// @desc    Create a new admin (admin-only)
// @route   POST /api/admin/create
// @access  Private (admin only)
// -------------------------------------------------------
const createAdmin = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: 'Email and password are required.',
    });
  }

  if (password.length < 8) {
    return res.status(400).json({
      success: false,
      message: 'Password must be at least 8 characters long.',
    });
  }

  const exists = await Admin.findOne({ email: email.toLowerCase() });
  if (exists) {
    return res.status(409).json({
      success: false,
      message: 'Admin with this email already exists.',
    });
  }

  const admin = await Admin.create({ email, password });

  return res.status(201).json({
    success: true,
    message: 'Admin account created successfully.',
    data: {
      id: admin._id,
      email: admin.email,
      createdAt: admin.createdAt,
    },
  });
};

// -------------------------------------------------------
// @desc    Get all registered admins
// @route   GET /api/admin/list
// @access  Private (admin only)
// -------------------------------------------------------
const getAdminList = async (req, res) => {
  const admins = await Admin.find({}, 'email createdAt').sort({ createdAt: -1 });

  return res.status(200).json({
    success: true,
    data: admins,
  });
};

// -------------------------------------------------------
// @desc    Change an admin password
// @route   PATCH /api/admin/:id/password
// @access  Private (admin only)
// -------------------------------------------------------
const changeAdminPassword = async (req, res) => {
  const { id } = req.params;
  const { password } = req.body;

  if (!password || password.length < 8) {
    return res.status(400).json({
      success: false,
      message: 'Password must be at least 8 characters long.',
    });
  }

  const admin = await Admin.findById(id);
  if (!admin) {
    return res.status(404).json({
      success: false,
      message: 'Admin not found.',
    });
  }

  admin.password = password;
  await admin.save();

  return res.status(200).json({
    success: true,
    message: 'Admin password updated successfully.',
  });
};

module.exports = { register, login, createAdmin, getAdminList, changeAdminPassword };
