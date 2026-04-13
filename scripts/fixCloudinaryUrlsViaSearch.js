require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');
const cloudinary = require('../config/cloudinary');

async function fixCloudinaryUrlsViaSearch() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get all products with broken local URLs
    const products = await Product.find({
      'mediaUrls': { $regex: 'localhost|/uploads/' }
    });

    console.log(`🔄 Processing ${products.length} products...\n`);

    let updated = 0;
    let failed = 0;

    // Create a cache for search results
    const fileCache = {};

    for (const product of products) {
      try {
        // Extract category keyword from URLs
        const firstUrl = product.mediaUrls[0];
        const filenameMatch = firstUrl.match(/\/([a-z]+-\d+)/);
        
        if (!filenameMatch) {
          console.log(`⚠️  "${product.title}" - Could not extract filename pattern`);
          failed++;
          continue;
        }

        // Extract the category (invitation, envelope, box, reel)
        const categoryMatch = filenameMatch[1].match(/^([a-z]+)-/);
        const category = categoryMatch ? categoryMatch[1] : product.category.toLowerCase();

        // Search for files matching this pattern
        if (!fileCache[category]) {
          const searchResult = await cloudinary.search
            .expression(`filename:${category}-*`)
            .max_results(500)
            .execute();
          fileCache[category] = searchResult.resources.map(r => r.secure_url);
          console.log(`📂 ${category}: Found ${fileCache[category].length} files\n`);
        }

        const availableUrls = fileCache[category];
        
        if (availableUrls.length === 0) {
          console.log(`⚠️  "${product.title}" - No files found for category: ${category}`);
          failed++;
          continue;
        }

        // Take as many URLs as the product needs (up to 5 usually)
        const newMediaUrls = availableUrls.slice(0, Math.min(10, product.mediaUrls.length));
        
        await Product.findByIdAndUpdate(product._id, {
          mediaUrls: newMediaUrls,
          mediaPublicIds: newMediaUrls.map((url, i) => `${category}-img-${i}`)
        });

        console.log(`✅ "${product.title}"`);
        console.log(`   Updated with ${newMediaUrls.length} ${category} images\n`);
        updated++;

      } catch (err) {
        console.error(`❌ Error updating "${product.title}":`, err.message);
        failed++;
      }

      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 50));
    }

    console.log('\n📊 Summary:');
    console.log(`   ✅ Updated: ${updated}/${products.length}`);
    console.log(`   ⚠️  Failed: ${failed}/${products.length}`);

    if (updated > 0) {
      console.log(`\n🎉 Success! Restart your server and reload the page.`);
      console.log('   Products should now display Cloudinary images.\n');
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Fatal Error:', error.message);
    process.exit(1);
  }
}

fixCloudinaryUrlsViaSearch();
