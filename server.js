import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import * as falModule from '@fal-ai/client';
const fal = (falModule.default && falModule.default.fal) ? falModule.default.fal : (falModule.fal || falModule);
import multer from 'multer';
import fs from 'fs';
import { pipeline } from 'stream/promises';
import ffmpeg from 'fluent-ffmpeg';

const app = express();
const PORT = process.env.PORT || 3000;
const uploadDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'uploads');
const tempDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'temp');

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

const upload = multer({ storage: multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${file.fieldname}-${Date.now()}${path.extname(file.originalname)}`)
})});

app.use((req, res, next) => {
    if(req.url.startsWith('/api')) console.log(`[${new Date().toISOString()}] API Request: ${req.method} ${req.url}`);
    next();
});

// Increased limit to handle base64 image uploads
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ limit: '500mb', extended: true }));
app.use(express.static(path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist')));

if (process.env.FAL_API_KEY) fal.config({ credentials: process.env.FAL_API_KEY });

app.get('/api/auth/key', (req, res) => res.json({ key: process.env.FAL_API_KEY }));

const conditionalUpload = (req, res, next) => {
    const contentType = req.headers['content-type'];
    if (contentType && contentType.includes('application/json')) {
        return next();
    }
    return upload.single('video')(req, res, next);
};

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
            return res.status(400).json({ error: 'No file or videoUrl provided' });
        }

        console.log(`✂️ Cutting video from ${startTime}s to ${endTime}s...`);
        const outputPath = path.join(tempDir, `cut-${Date.now()}.mp4`);

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
        const fileBuffer = fs.readFileSync(outputPath);
        const cutUrl = await fal.storage.upload(fileBuffer);
        
        console.log("✨ Segment uploaded successfully:", cutUrl);

        try {
            if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        } catch (cleanupErr) {
            console.error("⚠️ Cleanup warning:", cleanupErr);
        }

        res.json({ url: cutUrl });

    } catch (error) {
        console.error("Cut API Error:", error);
        res.status(500).json({ error: error.message });
    }
});

// FIX: Real Image Uploader
app.post('/api/upload', async (req, res) => {
    try {
        const { base64Data } = req.body;
        if (!base64Data) return res.status(400).json({ error: "No data" });

        console.log("🖼️ Uploading Image to Fal...");

        // Convert Base64 to Buffer
        // Remove header if present (e.g., "data:image/jpeg;base64,")
        const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        const imageBuffer = Buffer.from(matches ? matches[2] : base64Data, 'base64');

        // Upload Buffer to Fal
        const url = await fal.storage.upload(imageBuffer);
        
        console.log("✅ Image Uploaded:", url);
        res.json({ url });
    } catch (e) {
        console.error("Image Upload Error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/generate', async (req, res) => {
    try {
        const { model, input } = req.body;
        const result = await fal.queue.submit(model, { input });
        res.json(result);
    } catch (e) {
        console.error("Generate Error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/status/:requestId', async (req, res) => {
    try {
        const requestId = req.params.requestId;
        const model = req.query.model || "fal-ai/wan/v2.2-14b/animate/move";
        
        const status = await fal.queue.status(model, { requestId, logs: true });

        if (status.status === 'COMPLETED') {
            const result = await fal.queue.result(model, { requestId });
            return res.json({ ...status, ...result.data });
        }

        res.json(status);
    } catch (e) {
        console.error("Status Check Error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.listen(PORT, () => console.log(`⚡️ Server ready on port ${PORT}`));