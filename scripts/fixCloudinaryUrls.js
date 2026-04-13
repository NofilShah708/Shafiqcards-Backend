require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');
const cloudinary = require('../config/cloudinary');

async function fixCloudinaryUrls() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get all Cloudinary files
    console.log('🔍 Fetching Cloudinary files...');
    const allFiles = await cloudinary.search
      .expression('folder:shafiq-cards/products')
      .max_results(500)
      .sort_by('filename', 'asc')
      .execute();

    console.log(`📊 Found ${allFiles.resources.length} files in Cloudinary\n`);

    // Create a map of category to files
    const categoryFiles = {
      invitation: [],
      envelope: [],
      box: [],
      reel: []
    };

    allFiles.resources.forEach(resource => {
      const publicId = resource.public_id;
      const url = resource.secure_url;
      
      if (publicId.includes('invitation')) {
        categoryFiles.invitation.push({ url, publicId });
      } else if (publicId.includes('envelope')) {
        categoryFiles.envelope.push({ url, publicId });
      } else if (publicId.includes('box')) {
        categoryFiles.box.push({ url, publicId });
      } else if (publicId.includes('reel')) {
        categoryFiles.reel.push({ url, publicId });
      }
    });

    console.log('📂 Files by category:');
    Object.entries(categoryFiles).forEach(([cat, files]) => {
      console.log(`   ${cat}: ${files.length} files`);
    });
    console.log('');

    // Get all products with broken local URLs
    const products = await Product.find({
      'mediaUrls': { $regex: 'localhost|/uploads/' }
    });

    console.log(`🔄 Fixing ${products.length} products with broken URLs...\n`);

    let updated = 0;
    let failed = 0;

    for (const product of products) {
      try {
        const category = product.category.toLowerCase();
        const categoryCloudFiles = categoryFiles[category] || [];

        if (categoryCloudFiles.length === 0) {
          console.log(`⚠️  "${product.title}" - No ${category} files in Cloudinary`);
          failed++;
          continue;
        }

        // Calculate how many images this product needs
        const imagesToAssign = Math.min(
          product.mediaUrls.length,
          categoryCloudFiles.length
        );

        // Take the first N images from this category
        const assignedFiles = categoryCloudFiles.slice(0, imagesToAssign);
        
        await Product.findByIdAndUpdate(product._id, {
          mediaUrls: assignedFiles.map(f => f.url),
          mediaPublicIds: assignedFiles.map(f => f.publicId)
        });

        console.log(`✅ "${product.title}"`);
        console.log(`   Assigned ${assignedFiles.length} ${category} images from Cloudinary`);
        updated++;

      } catch (err) {
        console.error(`❌ "${product.title}": ${err.message}`);
        failed++;
      }
    }

    console.log(`\n📊 Summary:`);
    console.log(`   ✅ Fixed: ${updated} products`);
    console.log(`   ❌ Failed: ${failed} products`);

    if (updated > 0) {
      console.log(`\n🎉 Success! Restart your server and reload the page.`);
      console.log(`   All products should now display Cloudinary images.\n`);
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

fixCloudinaryUrls();
