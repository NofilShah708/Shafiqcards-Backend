/// USAGE:
// 1. Create a file called productMapping.json with structure:
// {
//   "products": [
//     { "title": "Product Name", "cloudinaryUrls": ["url1", "url2"] },
//     { "title": "Product 2", "cloudinaryUrls": ["url3"] }
//   ]
// }
// 2. Run: node scripts/batchUpdateProducts.js

require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');
const fs = require('fs');
const path = require('path');

async function batchUpdateProducts() {
  try {
    const mappingFile = path.join(__dirname, '../productMapping.json');
    
    if (!fs.existsSync(mappingFile)) {
      console.error('❌ productMapping.json not found!');
      console.log('\n📋 Create productMapping.json with this structure:\n');
      console.log(JSON.stringify({
        products: [
          { 
            title: "Invitation 1", 
            cloudinaryUrls: [
              "https://res.cloudinary.com/.../image1.jpg",
              "https://res.cloudinary.com/.../image2.jpg"
            ]
          },
          { 
            title: "Envelope 1", 
            cloudinaryUrls: ["https://res.cloudinary.com/.../envelope1.jpg"]
          }
        ]
      }, null, 2));
      console.log('\n✅ Then run this script again\n');
      process.exit(1);
    }

    const mapping = JSON.parse(fs.readFileSync(mappingFile, 'utf8'));
    
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB\n');

    let updated = 0;
    let notFound = 0;

    for (const item of mapping.products) {
      const product = await Product.findOne({ title: item.title });
      
      if (!product) {
        console.log(`❌ Product not found: "${item.title}"`);
        notFound++;
        continue;
      }

      // Extract public_ids from Cloudinary URLs
      const publicIds = item.cloudinaryUrls.map(url => {
        const match = url.match(/\/([^/]+)$/);
        return match ? match[1] : url;
      });

      await Product.findByIdAndUpdate(product._id, {
        mediaUrls: item.cloudinaryUrls,
        mediaPublicIds: publicIds
      });

      console.log(`✅ Updated: "${item.title}"`);
      console.log(`   URLs: ${item.cloudinaryUrls.length} images`);
      updated++;
    }

    console.log(`\n📊 Summary:`);
    console.log(`   ✅ Updated: ${updated}`);
    console.log(`   ❌ Not found: ${notFound}`);

    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

batchUpdateProducts();
