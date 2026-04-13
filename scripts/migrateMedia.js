'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const fs = require('fs');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const backendHost = process.env.BACKEND_URL || 'https://shafiqcards-backend.onrender.com';
// Configure your frontend media paths here
// Adjust paths based on where you run the script from. (Assuming scripts/ dir)
const PUBLIC_DIR = path.resolve(__dirname, '../../Client/public');

const categoriesToProcess = [
  {
    name: 'invitation',
    folder: path.join(PUBLIC_DIR, 'wedding_invitations'),
    resource_type: 'image',
    cloudFolder: 'shafiqcards/invitation'
  },
  {
    name: 'envelope',
    // Note: The frontend uses a typo "envilopes"
    folder: path.join(PUBLIC_DIR, 'envilopes'),
    resource_type: 'image',
    cloudFolder: 'shafiqcards/envelope'
  },
  {
    name: 'box',
    folder: path.join(PUBLIC_DIR, 'boxes'),
    resource_type: 'image',
    cloudFolder: 'shafiqcards/box'
  },
  {
    name: 'reel',
    folder: path.join(PUBLIC_DIR, 'reels'),
    resource_type: 'video',
    cloudFolder: 'shafiqcards/reel'
  }
];

// Helper to pause between uploads
const sleep = (ms) => new Promise(res => setTimeout(res, ms));

// Destination uploads folder setup
const DEST_DIR = path.resolve(__dirname, '../uploads');
if (!fs.existsSync(DEST_DIR)) {
  fs.mkdirSync(DEST_DIR, { recursive: true });
}


async function main() {
  console.log('🔄 Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ Connected.');

  console.log('✅ Connected.');


  for (const cat of categoriesToProcess) {
    console.log(`\n📂 Processing category: ${cat.name}`);
    if (!fs.existsSync(cat.folder)) {
      console.warn(`⚠️ Folder not found: ${cat.folder}. Skipping.`);
      continue;
    }

    const files = fs.readdirSync(cat.folder).filter(f => !f.startsWith('.'));
    
    // Group files by numeric prefix (e.g. "1.jpg" and "1b.jpg" belong to Product 1)
    const groups = new Map();
    for (const file of files) {
      const match = file.match(/^(\d+)/);
      if (!match) continue;
      const index = parseInt(match[1], 10);
      if (!groups.has(index)) groups.set(index, []);
      groups.get(index).push(file);
    }
    
    // Sort keys to maintain order
    const sortedIndices = Array.from(groups.keys()).sort((a, b) => a - b);
    console.log(`Found ${sortedIndices.length} distinct products in ${cat.folder}`);

    for (const index of sortedIndices) {
      const groupFiles = groups.get(index);
      
      // Look if the product already exists (by custom logic: title usually includes the index)
      // We will skip if a product for this category and index already exists to avoid duplicates
      // Easiest is to just check titles like "Product 1"
      const title = `${cat.name.charAt(0).toUpperCase() + cat.name.slice(1)} ${index}`;
      const existing = await Product.findOne({ title, category: cat.name });
      
      if (existing) {
        console.log(`⏩ Product "${title}" already exists. Skipping.`);
        continue;
      }
      
      console.log(`⬆️ Uploading ${groupFiles.length} files for product "${title}"...`);
      const mediaUrls = [];
      const mediaPublicIds = [];
      
      for (const file of groupFiles) {
        const fullPath = path.join(cat.folder, file);
        try {
          // Generate unique filename to avoid collision just in case
          const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
          const ext = path.extname(file);
          const newFilename = `${cat.name}-${uniqueSuffix}${ext}`;
          const destPath = path.join(DEST_DIR, newFilename);
          
          // Copy it over to Server/uploads
          fs.copyFileSync(fullPath, destPath);
          
          mediaUrls.push(`${backendHost}/uploads/${newFilename}`);
          mediaPublicIds.push(newFilename); // store local filename as "public id" for tracking if needed
        } catch (err) {
          console.error(`❌ Failed to copy ${file}:`, err.message);
        }
      }

      if (mediaUrls.length > 0) {
        await Product.create({
          title,
          category: cat.name,
          mediaUrls,
          mediaPublicIds,
          description: `Migrated local media for ${title}`
        });
        console.log(`✅ Created Product: "${title}" (${mediaUrls.length} media items)`);
      } else {
        console.warn(`⚠️ No successful uploads for "${title}". Document not created.`);
      }

      // Small delay to prevent rate limits
      await sleep(200);
    }
  }

  console.log('\n🎉 All processing complete.');
  mongoose.disconnect();
}

main().catch(err => {
  console.error('\n💣 Fatal Error:', err);
  mongoose.disconnect();
  process.exit(1);
});
