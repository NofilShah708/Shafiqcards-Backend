const { google } = require('googleapis');
const multer = require('multer');
const MulterGoogleStorage = require('multer-google-storage');

// Google Drive API setup
const KEYFILEPATH = process.env.GOOGLE_DRIVE_KEY_FILE || './config/google-drive-key.json';
const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

const auth = new google.auth.GoogleAuth({
  keyFile: KEYFILEPATH,
  scopes: SCOPES,
});

const drive = google.drive({ version: 'v3', auth });

// Multer storage for Google Drive
const storage = MulterGoogleStorage.storageEngine({
  autoRetry: true,
  bucket: process.env.GOOGLE_DRIVE_FOLDER_ID, // Your Google Drive folder ID
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
  keyFilename: KEYFILEPATH,
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + require('path').extname(file.originalname));
  },
});

// File filter
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
    cb(new Error(`Unsupported file type: ${file.mimetype}. Allowed: jpg, png, webp, mp4, mov`), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
});

module.exports = { upload, drive };