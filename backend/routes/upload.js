// routes/upload.js
const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;

const router = express.Router();

// configure Cloudinary from env
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Multer memory storage so we can stream buffer to Cloudinary
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: 6 * 1024 * 1024 }, // 6MB limit (adjust as needed)
    fileFilter: (req, file, cb) => {
        // Accept only images
        if (!file.mimetype.startsWith('image/')) {
            return cb(new Error('Only image files are allowed'));
        }
        cb(null, true);
    }
});

// POST /api/upload - receives field "file"
router.post('/', upload.single('file'), async (req, res) => {
    try {
        // inside router.post('/', upload.single('file'), async (req, res) => { ... })
        const file = req.file;
        if (!file) return res.status(400).json({ success: false, message: 'No file uploaded' });

        // convert buffer to data URI and upload
        const dataUri = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
        const result = await cloudinary.uploader.upload(dataUri, {
            folder: 'readcircle/listings',
            resource_type: 'image'
        });

        return res.json({
            success: true,
            url: result.secure_url,
            raw: { public_id: result.public_id, width: result.width, height: result.height }
        });

    } catch (err) {
        console.error('Upload error:', err && err.message ? err.message : err);
        return res.status(500).json({ success: false, message: err.message || 'Upload failed' });
    }
});

module.exports = router;
