require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');
const cloudinary = require('../config/cloudinary');

async function autoFixCloudinaryUrls() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get all Cloudinary files
    console.log('🔍 Fetching Cloudinary files...');
    const allFiles = await cloudinary.search
      .expression('folder:shafiq-cards/products')
      .max_results(500)
      .execute();

    console.log(`📊 Found ${allFiles.resources.length} files in Cloudinary\n`);

    if (allFiles.resources.length === 0) {
      console.log('❌ No files found in Cloudinary! Check if you uploaded them.');
      await mongoose.disconnect();
      return;
    }

    // Create a map of filename patterns to Cloudinary URLs
    const fileMap = new Map();
    allFiles.resources.forEach(resource => {
      // Extract the original filename or use public_id
      const publicId = resource.public_id;
      fileMap.set(publicId.toLowerCase(), resource.secure_url);
    });

    console.log('🔄 Processing products...\n');

    // Get all products with broken local URLs
    const products = await Product.find({
      'mediaUrls': { $regex: 'localhost|/uploads/' }
    });

    console.log(`📊 Found ${products.length} products with broken local URLs\n`);

    let updated = 0;
    let failed = 0;

    for (const product of products) {
      try {
        const newMediaUrls = [];
        const newPublicIds = [];
        let foundAny = false;

        for (const oldUrl of product.mediaUrls) {
          // Try to extract filename from the old URL
          const filename = oldUrl.split('/').pop();
          
          // Search for matching file in Cloudinary
          let found = false;
          
          // Try direct match
          for (const [key, url] of fileMap.entries()) {
            if (key.includes(filename.replace(/\.[^/.]+$/, '').toLowerCase()) || 
                filename.toLowerCase().includes(key.split('-').pop())) {
              newMediaUrls.push(url);
              newPublicIds.push(key);
              found = true;
              foundAny = true;
              break;
            }
          }

          // If not found, use first image from this product category's folder
          if (!found) {
            const categoryFiles = allFiles.resources.filter(r => 
              r.public_id.includes(product.category)
            );
            if (categoryFiles.length > 0) {
              newMediaUrls.push(categoryFiles[0].secure_url);
              newPublicIds.push(categoryFiles[0].public_id);
              foundAny = true;
            }
          }
        }

        // If we found at least one match, update the product
        if (foundAny && newMediaUrls.length > 0) {
          await Product.findByIdAndUpdate(product._id, {
            mediaUrls: newMediaUrls,
            mediaPublicIds: newPublicIds
          });
          console.log(`✅ "${product.title}"`);
          console.log(`   Updated: ${newMediaUrls.length} images from Cloudinary`);
          updated++;
        } else {
          console.log(`⚠️  "${product.title}"`);
          console.log(`   No matching files found in Cloudinary`);
          failed++;
        }
      } catch (err) {
        console.error(`❌ "${product.title}": ${err.message}`);
        failed++;
      }
    }

    console.log(`\n📊 Summary:`);
    console.log(`   ✅ Updated: ${updated}`);
    console.log(`   ⚠️  Failed: ${failed}`);
    console.log(`   📌 Total: ${products.length}`);

    if (failed > 0) {
      console.log(`\n💡 Tip: ${failed} products couldn't be auto-mapped.`);
      console.log('   You may need to manually re-upload their images using the Admin panel.\n');
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

autoFixCloudinaryUrls();
