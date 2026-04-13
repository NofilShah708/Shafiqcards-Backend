const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const {
  register,
  login,
  createAdmin,
  getAdminList,
  changeAdminPassword,
} = require('../controllers/authController');

// POST /api/admin/register
router.post('/register', register);

// POST /api/admin/login
router.post('/login', login);

// POST /api/admin/create
router.post('/create', authMiddleware, createAdmin);

// GET /api/admin/list
router.get('/list', authMiddleware, getAdminList);

// PATCH /api/admin/:id/password
router.patch('/:id/password', authMiddleware, changeAdminPassword);

module.exports = router;
