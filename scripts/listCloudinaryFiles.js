require('dotenv').config();
const cloudinary = require('../config/cloudinary');

async function listCloudinaryFiles() {
  try {
    console.log('🔍 Searching Cloudinary for uploaded files...\n');

    // Get all files in shafiq-cards/products folder
    const result = await cloudinary.search
      .expression('folder:shafiq-cards/products')
      .max_results(100)
      .execute();

    console.log(`📊 Found ${result.resources.length} files in Cloudinary\n`);

    if (result.resources.length === 0) {
      console.log('⚠️  No files found in Cloudinary!');
      console.log('   Did you upload the files? Check: https://cloudinary.com/console/media_library\n');
      return;
    }

    // Group by public_id prefix to find associated files
    const grouped = {};
    result.resources.forEach(resource => {
      const name = resource.public_id.split('/').pop(); // Get filename
      console.log(`📄 ${name}`);
      console.log(`   URL: ${resource.secure_url}`);
      console.log(`   Public ID: ${resource.public_id}`);
      console.log(`   Type: ${resource.resource_type}`);
      console.log('');
    });

    console.log('\n💡 Next Steps:');
    console.log('1. Save the Cloudinary URLs you see above');
    console.log('2. For each product, you need to map the URLs to the product ID');
    console.log('3. Or manually tag files in Cloudinary so we can auto-detect them\n');

    console.log('📌 Example: If you have invitation-1.jpg, envelope-1.jpg');
    console.log('   You can create a mapping file to update products\n');

  } catch (error) {
    console.error('❌ Error connecting to Cloudinary:', error.message);
  }
}

listCloudinaryFiles();
