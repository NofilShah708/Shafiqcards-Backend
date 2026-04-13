require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');
const cloudinary = require('../config/cloudinary');

async function fixProductUrls() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get all products with local URLs
    const products = await Product.find({
      'mediaUrls': { $regex: 'localhost|/uploads/' }
    });

    console.log(`📊 Found ${products.length} products with broken local URLs\n`);

    if (products.length === 0) {
      console.log('✅ All products already have Cloudinary URLs!');
      await mongoose.disconnect();
      return;
    }

    console.log('🔍 Looking for matching files in Cloudinary...\n');

    let fixed = 0;
    let failed = 0;

    for (const product of products) {
      console.log(`📝 Processing: "${product.title}"`);
      
      try {
        // Search Cloudinary for files that might match this product
        // Get all files from shafiq-cards/products folder
        const resources = await cloudinary.search
          .expression(`folder:shafiq-cards/products AND tags:${product._id}`)
          .max_results(100)
          .execute();

        if (resources.resources && resources.resources.length > 0) {
          // Found matching files in Cloudinary
          const newUrls = resources.resources.map(r => r.secure_url);
          
          await Product.findByIdAndUpdate(product._id, {
            mediaUrls: newUrls,
            mediaPublicIds: resources.resources.map(r => r.public_id)
          });

          console.log(`   ✅ Updated with ${newUrls.length} Cloudinary images\n`);
          fixed++;
        } else {
          // No files found with product ID tag
          // List files in Cloudinary and show them so user can manually map
          console.log(`   ⚠️  No matching files found (Product may need manual upload)\n`);
          failed++;
        }
      } catch (error) {
        console.error(`   ❌ Error:`, error.message, '\n');
        failed++;
      }
    }

    console.log('\n📊 Summary:');
    console.log(`   ✅ Products fixed: ${fixed}`);
    console.log(`   ❌ Products failed: ${failed}`);
    console.log(`   📌 Total attempted: ${products.length}\n`);

    if (failed > 0) {
      console.log('📌 Next Steps:');
      console.log('   1. Go to: https://cloudinary.com/console/media_library');
      console.log('   2. Check the "shafiq-cards/products" folder');
      console.log('   3. For each product, upload media files manually and tag them with product ID');
      console.log('   4. Or re-run this script after manual uploads\n');
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Fatal Error:', error.message);
    process.exit(1);
  }
}

fixProductUrls();
