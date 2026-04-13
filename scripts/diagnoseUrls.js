require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');

async function diagnose() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    const allProducts = await Product.find({});
    console.log(`📊 Total products: ${allProducts.length}\n`);

    // Analyze URL types
    let localUrls = 0;
    let cloudinaryUrls = 0;
    let emptyUrls = 0;

    const urlExamples = {
      local: null,
      cloudinary: null,
      empty: null
    };

    allProducts.forEach(product => {
      if (!product.mediaUrls || product.mediaUrls.length === 0) {
        emptyUrls++;
        if (!urlExamples.empty) urlExamples.empty = product.title;
      } else {
        product.mediaUrls.forEach(url => {
          if (url.includes('cloudinary.com')) {
            cloudinaryUrls++;
            if (!urlExamples.cloudinary) {
              urlExamples.cloudinary = { title: product.title, url };
            }
          } else if (url.includes('/uploads/') || url.includes('localhost')) {
            localUrls++;
            if (!urlExamples.local) {
              urlExamples.local = { title: product.title, url };
            }
          }
        });
      }
    });

    console.log('📈 URL Types Analysis:');
    console.log(`   - Products with local URLs: ${localUrls}`);
    console.log(`   - Products with Cloudinary URLs: ${cloudinaryUrls}`);
    console.log(`   - Products with empty URLs: ${emptyUrls}\n`);

    console.log('📋 Examples:');
    if (urlExamples.local) {
      console.log(`   LOCAL: "${urlExamples.local.title}"`);
      console.log(`   URL: ${urlExamples.local.url}\n`);
    }
    if (urlExamples.cloudinary) {
      console.log(`   CLOUDINARY: "${urlExamples.cloudinary.title}"`);
      console.log(`   URL: ${urlExamples.cloudinary.url}\n`);
    }
    if (urlExamples.empty) {
      console.log(`   EMPTY: "${urlExamples.empty}"\n`);
    }

    console.log('💡 Recommendation:');
    if (localUrls > 0) {
      console.log(`   ⚠️  ${localUrls} products still have local URLs but the files were deleted from uploads folder.`);
      console.log('   📌 These products will show broken images in the frontend.\n');
      console.log('   🔧 Solution: You need to manually upload these media files to Cloudinary');
      console.log('   and update the product URLs in the database.\n');
      console.log('   📂 Check your Cloudinary dashboard for uploaded files:');
      console.log('   https://cloudinary.com/console/media_library/folders\n');
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

diagnose();