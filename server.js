import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import * as falModule from '@fal-ai/client';
// Handle Fal import for different environments
const fal = (falModule.default && falModule.default.fal) ? falModule.default.fal : (falModule.fal || falModule);
import multer from 'multer';
import fs from 'fs';
import { pipeline } from 'stream/promises';
// FIX: This import was missing in the previous version
import ffmpeg from 'fluent-ffmpeg';

const app = express();
const PORT = process.env.PORT || 3000;
const uploadDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'uploads');
const tempDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'temp');

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

// Configure Multer
const upload = multer({ storage: multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${file.fieldname}-${Date.now()}${path.extname(file.originalname)}`)
})});

// Logging
app.use((req, res, next) => {
    if(req.url.startsWith('/api')) console.log(`[${new Date().toISOString()}] API Request: ${req.method} ${req.url}`);
    next();
});

// Increase JSON limits
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ limit: '500mb', extended: true }));
app.use(express.static(path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist')));

// Initialize Fal on Backend
if (process.env.FAL_API_KEY) fal.config({ credentials: process.env.FAL_API_KEY });

// Endpoints
app.get('/api/auth/key', (req, res) => res.json({ key: process.env.FAL_API_KEY }));

// --- MIDDLEWARE FIX: Conditionally apply Multer ---
const conditionalUpload = (req, res, next) => {
    const contentType = req.headers['content-type'];
    if (contentType && contentType.includes('application/json')) {
        // Skip Multer for JSON requests (Large files bypass)
        return next();
    }
    // Use Multer for Multipart requests (Small files)
    return upload.single('video')(req, res, next);
};

// UNIVERSAL CUTTER ROUTE
app.post('/api/cut-and-upload', conditionalUpload, async (req, res) => {
    try {
        const { startTime, endTime, videoUrl } = req.body;
        let inputPath;
        
        if (req.file) {
            console.log("✂️ Processing uploaded local file...");
            inputPath = req.file.path;
        } else if (videoUrl) {
            console.log(`⬇️ Downloading Video from URL: ${videoUrl}`);
            inputPath = path.join(uploadDir, `download-${Date.now()}.mp4`);
            
            const downloadRes = await fetch(videoUrl);
            if (!downloadRes.ok) throw new Error(`Download failed: ${downloadRes.statusText}`);
            
            await pipeline(downloadRes.body, fs.createWriteStream(inputPath));
            console.log("✅ Download complete.");
        } else {
            return res.status(400).json({ error: 'No file or videoUrl provided in request' });
        }

        console.log(`✂️ Cutting video from ${startTime}s to ${endTime}s...`);
        const outputPath = path.join(tempDir, `cut-${Date.now()}.mp4`);

        // 1. Run FFmpeg to cut the clip
        await new Promise((resolve, reject) => {
            ffmpeg(inputPath)
                .setStartTime(startTime)
                .setDuration(endTime - startTime)
                .output(outputPath)
                .on('end', () => resolve())
                .on('error', (err) => reject(new Error(`FFmpeg Error: ${err.message}`)))
                .run();
        });

        console.log("✅ Cut complete. Uploading segment to Fal...");

        // 2. Upload the cut clip back to Fal (so Wan 2.2 can use it)
        const fileBuffer = fs.readFileSync(outputPath);
        const cutUrl = await fal.storage.upload(fileBuffer);
        
        console.log("✨ Segment uploaded successfully:", cutUrl);

        // 3. Cleanup: Delete the huge downloaded file and the temp cut file
        try {
            if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        } catch (cleanupErr) {
            console.error("⚠️ Cleanup warning:", cleanupErr);
        }

        // 4. Return the NEW URL (the cut clip)
        res.json({ url: cutUrl });

    } catch (error) {
        console.error("Cut API Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// ... (Other routes) ...
app.post('/api/upload', express.json({limit: '50mb'}), (req, res) => {
    // Placeholder for your existing image upload logic
    res.json({ url: "https://placeholder.com/image.jpg" });
});

app.post('/api/generate', async (req, res) => {
    try {
        const { model, input } = req.body;
        const result = await fal.queue.submit(model, { input });
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/status/:requestId', async (req, res) => {
    try {
        const status = await fal.queue.status(req.params.requestId);
        res.json(status);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.listen(PORT, () => console.log(`⚡️ Server ready on port ${PORT}`));