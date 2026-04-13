const multer = require('multer');
const path = require('path');
const cloudinary = require('../config/cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

// Check if Cloudinary is configured
const useCloudinary = process.env.CLOUDINARY_CLOUD_NAME &&
                     process.env.CLOUDINARY_API_KEY &&
                     process.env.CLOUDINARY_API_SECRET &&
                     process.env.CLOUDINARY_CLOUD_NAME !== 'your_cloud_name' &&
                     process.env.CLOUDINARY_API_KEY !== 'your_api_key';

let storage;

if (useCloudinary) {
  // Use Cloudinary storage
  try {
    const getCloudinaryParams = (req, file) => {
      const isVideo = file.mimetype.startsWith('video/');
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);

      return {
        folder: 'shafiq-cards/products', // Organize files in a folder
        resource_type: isVideo ? 'video' : 'image',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'mp4', 'mov'],
        transformation: isVideo ? [] : [{ width: 1200, height: 1200, crop: 'limit' }],
        public_id: `${file.fieldname}-${uniqueSuffix}`,
      };
    };

    storage = new CloudinaryStorage({
      cloudinary: cloudinary,
      params: getCloudinaryParams,
    });
    console.log('✅ Using Cloudinary for file uploads');
  } catch (error) {
    console.error('❌ Cloudinary configuration error:', error.message);
    console.log('🔄 Falling back to local storage');
    // Fall back to local storage
    storage = multer.diskStorage({
      destination: (req, file, cb) => {
        cb(null, path.join(__dirname, '../uploads'));
      },
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
      }
    });
  }
} else {
  // Use local disk storage
  console.log('💾 Using local storage for file uploads');
  storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, path.join(__dirname, '../uploads'));
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
  });
}

// -------------------------------------------------------
// File filter — reject unsupported types early
// -------------------------------------------------------
const fileFilter = (req, file, cb) => {
  const allowed = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'video/mp4',
    'video/quicktime',
  ];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `Unsupported file type: ${file.mimetype}. Allowed: jpg, png, webp, mp4, mov`
      ),
      false
    );
  }
};

// -------------------------------------------------------
// Multer instance — 50 MB limit per file
// -------------------------------------------------------
const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
});

module.exports = upload;
