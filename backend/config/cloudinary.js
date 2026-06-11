const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Avatar storage
const avatarStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'connectpro/avatars',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 400, height: 400, crop: 'fill', gravity: 'face' }],
  },
});

// Post image storage
const postStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'connectpro/posts',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
    transformation: [{ width: 1080, quality: 'auto' }],
    resource_type: 'auto',
  },
});

// Cover photo storage
const coverStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'connectpro/covers',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 1200, height: 400, crop: 'fill' }],
  },
});

// Message file storage
const messageStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'connectpro/messages',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'pdf', 'mp4'],
    resource_type: 'auto',
  },
});

const uploadAvatar = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

const uploadPost = multer({
  storage: postStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

const uploadCover = multer({
  storage: coverStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

const uploadMessage = multer({
  storage: messageStorage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
});

const deleteMedia = async (publicId, resourceType = 'image') => {
  try {
    const result = await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    return result;
  } catch (err) {
    console.error('Cloudinary delete error:', err);
  }
};

module.exports = { cloudinary, uploadAvatar, uploadPost, uploadCover, uploadMessage, deleteMedia };
