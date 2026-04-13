const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const cloudinary = require('../config/cloudinary');
const Product = require('../models/Product');
require('dotenv').config();

// Helper function to sleep
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Check if Cloudinary is configured
const useCloudinary = process.env.CLOUDINARY_CLOUD_NAME &&
                     process.env.CLOUDINARY_API_KEY &&
                     process.env.CLOUDINARY_API_SECRET &&
                     process.env.CLOUDINARY_CLOUD_NAME !== 'your_cloud_name';

if (!useCloudinary) {
  console.error('❌ Cloudinary is not configured. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in your .env file.');
  process.exit(1);
}

async function migrateProductToCloudinary(product) {
  const backendHost = process.env.BACKEND_URL || 'https://shafiqcards-backend.onrender.com';
  const uploadsDir = path.join(__dirname, '../uploads');

  console.log(`\n🔄 Migrating product: "${product.title}" (${product.mediaUrls.length} files)`);

  const newMediaUrls = [];
  const newMediaPublicIds = [];

  for (let i = 0; i < product.mediaUrls.length; i++) {
    const mediaUrl = product.mediaUrls[i];
    const publicId = product.mediaPublicIds[i] || null;

    // Check if it's already a Cloudinary URL
    if (mediaUrl.includes('cloudinary.com')) {
      console.log(`⏩ File ${i + 1} already on Cloudinary: ${mediaUrl}`);
      newMediaUrls.push(mediaUrl);
      newMediaPublicIds.push(publicId);
      continue;
    }

    // Extract filename from local URL
    const filename = mediaUrl.replace(`${backendHost}/uploads/`, '');
    const localFilePath = path.join(uploadsDir, filename);

    // Check if local file exists
    if (!fs.existsSync(localFilePath)) {
      console.warn(`⚠️ Local file not found: ${localFilePath}. Skipping this file.`);
      continue;
    }

    try {
      console.log(`⬆️ Uploading ${filename} to Cloudinary...`);

      // Upload to Cloudinary
      const result = await cloudinary.uploader.upload(localFilePath, {
        folder: 'shafiq-cards/products',
        public_id: `migrated-${product.category}-${product._id}-${i}-${Date.now()}`,
        transformation: [
          { width: 1200, height: 1200, crop: 'limit' }
        ]
      });

      newMediaUrls.push(result.secure_url);
      newMediaPublicIds.push(result.public_id);

      console.log(`✅ Uploaded: ${result.secure_url}`);

      // Optional: Remove local file after successful upload
      // fs.unlinkSync(localFilePath);

    } catch (error) {
      console.error(`❌ Failed to upload ${filename}:`, error.message);
      // Keep original URL if upload fails
      newMediaUrls.push(mediaUrl);
      newMediaPublicIds.push(publicId);
    }

    // Small delay to prevent rate limits
    await sleep(500);
  }

  // Update product in database
  if (newMediaUrls.length > 0) {
    await Product.findByIdAndUpdate(product._id, {
      mediaUrls: newMediaUrls,
      mediaPublicIds: newMediaPublicIds
    });
    console.log(`✅ Updated product "${product.title}" in database`);
  }

  return newMediaUrls.length;
}

async function main() {
  console.log('🔄 Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ Connected to MongoDB.');

  console.log('🔄 Starting migration to Cloudinary...');

  // Find all products
  const products = await Product.find({});
  console.log(`📊 Found ${products.length} products to process.`);

  let totalFilesMigrated = 0;
  let productsUpdated = 0;

  for (const product of products) {
    const filesMigrated = await migrateProductToCloudinary(product);
    totalFilesMigrated += filesMigrated;
    if (filesMigrated > 0) {
      productsUpdated++;
    }

    // Progress indicator
    console.log(`📈 Progress: ${products.indexOf(product) + 1}/${products.length} products processed`);
  }

  console.log('\n🎉 Migration complete!');
  console.log(`📊 Summary:`);
  console.log(`   - Products processed: ${products.length}`);
  console.log(`   - Products updated: ${productsUpdated}`);
  console.log(`   - Total files migrated: ${totalFilesMigrated}`);

  // Optional: Clean up empty uploads directory
  // const uploadsDir = path.join(__dirname, '../uploads');
  // if (fs.existsSync(uploadsDir)) {
  //   const files = fs.readdirSync(uploadsDir);
  //   if (files.length === 0) {
  //     fs.rmdirSync(uploadsDir);
  //     console.log('🧹 Removed empty uploads directory');
  //   }
  // }

  await mongoose.disconnect();
  console.log('✅ Disconnected from MongoDB.');
}

main().catch(err => {
  console.error('\n💣 Fatal Error:', err);
  mongoose.disconnect();
  process.exit(1);
});