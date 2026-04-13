require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const cloudinary = require('../config/cloudinary');
const WebInvitation = require('../models/WebInvitation');

const UPLOADS_DIR = path.join(__dirname, '../uploads/user_uploads');
const CLOUD_FOLDER = 'shafiq-cards/web-invitations';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isCloudinaryUrl = (url) => typeof url === 'string' && url.includes('cloudinary.com');

const getLocalFilePath = (mediaUrl) => {
  if (typeof mediaUrl !== 'string' || mediaUrl.trim() === '') return null;

  if (mediaUrl.startsWith('/uploads/user_uploads/')) {
    return path.join(UPLOADS_DIR, mediaUrl.replace('/uploads/user_uploads/', ''));
  }

  if (mediaUrl.includes('/uploads/user_uploads/')) {
    const filename = mediaUrl.split('/uploads/user_uploads/').pop();
    return path.join(UPLOADS_DIR, filename);
  }

  if (mediaUrl.startsWith('http://') || mediaUrl.startsWith('https://')) {
    return null;
  }

  return path.join(UPLOADS_DIR, path.basename(mediaUrl));
};

const buildPublicId = (slug, index, filename) => {
  const safeSlug = slug ? slug.replace(/[^a-zA-Z0-9_-]/g, '_') : 'invitation';
  const safeFilename = filename.replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${safeSlug}-${index + 1}-${safeFilename}`;
};

const uploadLocalMedia = async (localPath, publicId) => {
  const uploadOptions = {
    folder: CLOUD_FOLDER,
    public_id: publicId,
    overwrite: true,
    resource_type: 'auto',
    transformation: [{ width: 1200, height: 1200, crop: 'limit' }],
  };

  const result = await cloudinary.uploader.upload(localPath, uploadOptions);
  return result.secure_url;
};

const migrateInvitationMedia = async (invitation) => {
  const newMedia = [];
  let changed = false;

  for (let i = 0; i < invitation.media.length; i += 1) {
    const mediaUrl = invitation.media[i];
    const localPath = getLocalFilePath(mediaUrl);

    if (!localPath) {
      newMedia.push(mediaUrl);
      continue;
    }

    if (!fs.existsSync(localPath)) {
      console.warn(`⚠️ Local file missing for invitation ${invitation.slug}: ${localPath}`);
      newMedia.push(mediaUrl);
      continue;
    }

    const filename = path.basename(localPath);
    const publicId = buildPublicId(invitation.slug || invitation._id.toString(), i, filename);

    try {
      console.log(`⬆️ Uploading [${invitation.slug}] ${filename}`);
      const secureUrl = await uploadLocalMedia(localPath, publicId);
      newMedia.push(secureUrl);
      changed = true;
      console.log(`   ✅ Uploaded to Cloudinary: ${secureUrl}`);
    } catch (error) {
      console.error(`   ❌ Upload failed for ${filename}: ${error.message}`);
      newMedia.push(mediaUrl);
    }

    await sleep(300);
  }

  if (changed) {
    await WebInvitation.updateOne({ _id: invitation._id }, { $set: { media: newMedia } });
    console.log(`✅ Updated invitation ${invitation.slug} (${invitation._id})`);
  } else {
    console.log(`ℹ️ No local media migrated for ${invitation.slug}`);
  }

  return changed;
};

const main = async () => {
  if (!process.env.MONGO_URI) {
    console.error('❌ MONGO_URI is not defined. Please set it in your .env file.');
    process.exit(1);
  }

  console.log('🔄 Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  console.log('✅ Connected to MongoDB.');

  const invitations = await WebInvitation.find({
    media: { $elemMatch: { $regex: '^(/uploads/user_uploads/|.*uploads/user_uploads/)' } },
  });

  console.log(`🔄 Found ${invitations.length} invitations with local upload media.`);

  let migratedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const invitation of invitations) {
    try {
      const changed = await migrateInvitationMedia(invitation);
      if (changed) migratedCount += 1;
      else skippedCount += 1;
    } catch (error) {
      console.error(`❌ Failed invitation ${invitation.slug}: ${error.message}`);
      errorCount += 1;
    }
  }

  console.log('\n📊 Migration summary:');
  console.log(`   ✅ Invitations migrated: ${migratedCount}`);
  console.log(`   ⚠️ Invitations skipped: ${skippedCount}`);
  console.log(`   ❌ Invitations failed: ${errorCount}`);

  await mongoose.disconnect();
  console.log('✅ Disconnected from MongoDB.');
};

main().catch((error) => {
  console.error('❌ Migration script failed:', error);
  process.exit(1);
});