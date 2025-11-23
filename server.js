import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import * as falModule from '@fal-ai/client';
const fal = (falModule.default && falModule.default.fal) ? falModule.default.fal : (falModule.fal || falModule);
import multer from 'multer';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import { Blob } from 'buffer'; 

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;

// Directories
const uploadDir = path.join(__dirname, 'uploads');
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

// Multer Config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${file.fieldname}-${Date.now()}${path.extname(file.originalname)}`)
});

const upload = multer({ 
    storage: storage, 
    limits: { fileSize: 500 * 1024 * 1024 } 
});

// Middleware
app.use((req, res, next) => {
    if(req.url.startsWith('/api')) {
        console.log(`[${new Date().toISOString()}] API Request: ${req.method} ${req.url}`);
    }
    next();
});

app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ limit: '500mb', extended: true }));
app.use(express.static(path.join(__dirname, 'dist')));

// Fal Config
if (!process.env.FAL_API_KEY) {
    console.error('❌ CRITICAL: FAL_API_KEY is missing from .env');
} else {
    fal.config({ credentials: process.env.FAL_API_KEY });
}

// --- ROUTES ---

const uploadMiddleware = upload.single('video');

// 1. VIDEO CUTTER ROUTE
app.post('/api/cut-and-upload', (req, res) => {
    uploadMiddleware(req, res, async (err) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        try {
            const { startTime, endTime } = req.body;
            console.log(`✂️ Processing: ${req.file.filename} (${startTime}s - ${endTime}s)`);

            const inputPath = req.file.path;
            const outputFilename = `cut-${Date.now()}.mp4`;
            const outputPath = path.join(tempDir, outputFilename);
            const duration = parseFloat(endTime) - parseFloat(startTime);

            if (!fal || !fal.storage) throw new Error("Fal Client not initialized");

            ffmpeg(inputPath)
                .setStartTime(startTime)
                .setDuration(duration)
                .videoCodec('libx264')
                .audioCodec('aac')
                .output(outputPath)
                .on('end', async () => {
                    console.log('✅ Cut finished. Uploading to Fal...');
                    try {
                        const fileBuffer = fs.readFileSync(outputPath);
                        const blob = new Blob([fileBuffer], { type: 'video/mp4' });
                        const url = await fal.storage.upload(blob);
                        console.log('🚀 Fal Video Uploaded:', url);
                        try { fs.unlinkSync(inputPath); fs.unlinkSync(outputPath); } catch(e) {}
                        res.json({ url });
                    } catch (falErr) {
                        console.error('❌ Fal Upload Failed:', falErr);
                        res.status(500).json({ error: 'Fal upload failed.' });
                    }
                })
                .on('error', (ffmpegErr) => {
                    console.error('❌ FFmpeg Failed:', ffmpegErr);
                    res.status(500).json({ error: 'Video processing failed.' });
                })
                .run();

        } catch (error) {
            console.error('❌ Error:', error);
            res.status(500).json({ error: error.message });
        }
    });
});

// 2. NEW: IMAGE UPLOAD ROUTE (This was missing!)
app.post('/api/upload', async (req, res) => {
    try {
        const { base64Data } = req.body;
        if (!base64Data) return res.status(400).json({ error: 'No base64 data provided' });

        console.log('📸 Uploading image to Fal...');

        // Handle base64 string (strip prefix if exists)
        const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        let buffer, mimeType;

        if (matches && matches.length === 3) {
            mimeType = matches[1];
            buffer = Buffer.from(matches[2], 'base64');
        } else {
            mimeType = 'image/jpeg';
            buffer = Buffer.from(base64Data, 'base64');
        }

        const blob = new Blob([buffer], { type: mimeType });
        const url = await fal.storage.upload(blob);
        
        console.log('✨ Image Uploaded:', url);
        res.json({ url });

    } catch (error) {
        console.error('❌ Image Upload Error:', error);
        res.status(500).json({ error: 'Image upload failed' });
    }
});

// 3. GENERATE ROUTE
app.post('/api/generate', async (req, res) => {
    try {
        const { model, input } = req.body;
        console.log(`🎨 Generating ${model}...`);
        const result = await fal.subscribe(model, {
            input,
            logs: true,
            onQueueUpdate: (update) => {
                if (update.status === 'IN_PROGRESS' && update.logs) {
                    update.logs.forEach(l => console.log('Fal:', l.message));
                }
            }
        });
        res.json(result);
    } catch (error) {
        console.error('❌ Generation Error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => console.log(`⚡️ Server ready on port ${PORT}`));