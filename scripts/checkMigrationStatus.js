require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('../models/Product');

async function checkStatus() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    
    const brokenCount = await Product.countDocuments({
      mediaUrls: { $regex: 'localhost|/uploads/' }
    });
    
    const cloudinaryCount = await Product.countDocuments({
      mediaUrls: { $regex: 'cloudinary.com' }
    });
    
    const total = await Product.countDocuments();
    
    console.log('\n📊 Migration Status:');
    console.log(`   Total products: ${total}`);
    console.log(`   ✅ Cloudinary URLs: ${cloudinaryCount}`);
    console.log(`   ⚠️  Broken local URLs: ${brokenCount}`);
    
    if (brokenCount === 0 && cloudinaryCount > 0) {
      console.log('\n🎉 SUCCESS! All products are now using Cloudinary!\n');
    } else {
      console.log('\n⚠️  Some products still need updating.\n');
    }
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkStatus();
