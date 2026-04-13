'use strict';

// ================================================================
// Load environment variables FIRST (before any other imports)
// ================================================================
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const missingEnv = ['MONGO_URI', 'JWT_SECRET'].filter((key) => !process.env[key]);
if (missingEnv.length > 0) {
  console.error(`Missing required environment variables: ${missingEnv.join(', ')}`);
  process.exit(1);
}

// ================================================================
// Dependencies
// ================================================================
const express = require('express');
const cors = require('cors');



// Patch Promise rejections in async route handlers automatically
// (no try/catch needed in controllers thanks to this)
require('express-async-errors');

// Internal modules
const connectDB = require('./config/db');
const adminRoutes = require('./routes/adminRoutes');
const productRoutes = require('./routes/productRoutes');
const webInvitationRoutes = require('./routes/webInvitationRoutes');

// ================================================================
// Initialize Express App
// ================================================================
const app = express();

// ================================================================
// CORS
// ================================================================
const allowedOrigins = [
  'https://shafiqcards.com',
  'https://www.shafiqcards.com',
  process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  'http://localhost:5000', // Template iframe (same server)
  'http://localhost:3000',
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (Postman, curl, mobile apps)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: Origin "${origin}" not allowed.`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// ================================================================
// Static Files
// ================================================================
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/api/web-invitations/html/templates', express.static(path.join(__dirname, 'templates')));

// ================================================================
// Body Parsers
// ================================================================
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));


// ================================================================
// Health Check
// ================================================================
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Shafiq Cards API is running 🚀',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
  });
});

// ================================================================
// API Routes
// ================================================================
app.use('/api/admin', adminRoutes);
app.use('/api/products', productRoutes);
app.use('/api/web-invitations', webInvitationRoutes);

// ================================================================
// 404 Handler — unknown routes
// ================================================================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// ================================================================
// Global Error Handler
// Must have 4 parameters for Express to recognise as error middleware
// ================================================================
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.message);

  // Multer file size exceeded
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      success: false,
      message: 'File too large. Maximum size is 50 MB.',
    });
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({
      success: false,
      message: messages.join('. '),
    });
  }

  // Mongoose duplicate key (e.g. duplicate email)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return res.status(409).json({
      success: false,
      message: `Duplicate value for field: ${field}`,
    });
  }

  // Mongoose cast error (bad ObjectId)
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: `Invalid value for field: ${err.path}`,
    });
  }

  // CORS error
  if (err.message && err.message.startsWith('CORS:')) {
    return res.status(403).json({
      success: false,
      message: err.message,
    });
  }

  // Default — hide internal details in production
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    message:
      process.env.NODE_ENV === 'production'
        ? 'Internal server error.'
        : err.message,
  });
});

// ================================================================
// Start Server
// ================================================================
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  await connectDB();
  app.listen(PORT, () => {
    console.log(
      `\n🚀 Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`
    );
    console.log(`   Health: http://localhost:${PORT}/api/health\n`);
  });
};

startServer();
