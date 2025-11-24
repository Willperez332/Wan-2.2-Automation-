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
import { pipeline } from 'stream/promises'; 

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;

const uploadDir = path.join(__dirname, 'uploads');
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

const upload = multer({ storage: multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${file.fieldname}-${Date.now()}${path.extname(file.originalname)}`)
})});
// 1. Create a Helper to conditionally apply Multer
const conditionalUpload = (req, res, next) => {
    const contentType = req.headers['content-type'];
    // If it's a JSON request, skip Multer and go to the route handler
    if (contentType && contentType.includes('application/json')) {
        return next();
    }
    // Otherwise, run Multer for multipart/form-data
    return upload.single('video')(req, res, next);
};

app.use((req, res, next) => {
    if(req.url.startsWith('/api')) console.log(`[${new Date().toISOString()}] API: ${req.method} ${req.url}`);
    next();
});

app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ limit: '500mb', extended: true }));
app.use(express.static(path.join(__dirname, 'dist')));

if (process.env.FAL_API_KEY) fal.config({ credentials: process.env.FAL_API_KEY });

// --- ROUTES ---

// 1. GET FAL KEY (For Client-Side Uploads)
// ⚠️ NOTE: In a public app, use a temporary token. For this internal tool, sending the key is acceptable.
app.get('/api/auth/key', (req, res) => {
    res.json({ key: process.env.FAL_API_KEY });
});

// 2. UNIVERSAL CUTTER (Accepts File OR URL)
app.post('/api/cut-and-upload', conditionalUpload, async (req, res) => {
    try {
        const { startTime, endTime, videoUrl } = req.body;
        let inputPath;

        // A. Handle Direct File Upload (Small files)
        if (req.file) {
            // Case A: Small file uploaded via Multer
            console.log("✂️ Cutting uploaded local file...");
            inputPath = req.file.path;
        } else if (videoUrl) {
            // Case B: Large file URL passed via JSON
            console.log(`⬇️ Downloading Video from URL: ${videoUrl}`);
            inputPath = path.join(uploadDir, `download-${Date.now()}.mp4`);
            
            const downloadRes = await fetch(videoUrl);
            if (!downloadRes.ok) throw new Error(`Download failed: ${downloadRes.statusText}`);
            
            await pipeline(downloadRes.body, fs.createWriteStream(inputPath));
            console.log("✅ Download complete.");
        } else {
            return res.status(400).json({ error: 'No file or videoUrl provided' });
        }

        // Processing
        const outputFilename = `cut-${Date.now()}.mp4`;
        const outputPath = path.join(tempDir, outputFilename);
        const duration = parseFloat(endTime) - parseFloat(startTime);

        ffmpeg(inputPath)
            .setStartTime(startTime)
            .setDuration(duration)
            .videoCodec('libx264')
            .audioCodec('aac')
            .output(outputPath)
            .on('end', async () => {
                try {
                    console.log('✅ Cut Success. Uploading Clip...');
                    const fileBuffer = fs.readFileSync(outputPath);
                    const blob = new Blob([fileBuffer], { type: 'video/mp4' });
                    const url = await fal.storage.upload(blob);
                    console.log('🚀 Clip Uploaded:', url);
                    
                    // Cleanup
                    try { 
                        if(cleanupInput) fs.unlinkSync(inputPath); 
                        fs.unlinkSync(outputPath); 
                    } catch(e) {}
                    
                    res.json({ url });
                } catch (falErr) {
                    console.error('❌ Fal Upload Error:', falErr);
                    res.status(500).json({ error: 'Fal upload failed' });
                }
            })
            .on('error', (err) => {
                console.error('❌ FFmpeg Error:', err);
                res.status(500).json({ error: 'Video processing failed' });
            })
            .run();

    } catch (error) {
        console.error("Cut API Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// 3. IMAGE UPLOAD
app.post('/api/upload', async (req, res) => {
    try {
        const { base64Data } = req.body;
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
        res.json({ url });
    } catch (error) {
        res.status(500).json({ error: 'Image upload failed' });
    }
});

// 4. GENERATE (Async)
app.post('/api/generate', async (req, res) => {
    try {
        const { model, input } = req.body;
        const { request_id } = await fal.queue.submit(model, { input });
        console.log(`🎫 Job ${request_id} submitted`);
        res.json({ request_id });
    } catch (error) {
        console.error('❌ Generation Error:', error);
        res.status(500).json({ error: error.message });
    }
});


// 5. STATUS
app.get('/api/status/:requestId', async (req, res) => {
    try {
        const status = await fal.queue.status(req.params.requestId, { logs: true });
        res.json(status);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => console.log(`⚡️ Server ready on port ${PORT}`));