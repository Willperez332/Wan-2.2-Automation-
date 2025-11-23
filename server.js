import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
// Use the safe import pattern for Fal
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
    // FIXED: The typo was here (newDG -> new Date)
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

// Routes
const uploadMiddleware = upload.single('video');

app.post('/api/cut-and-upload', (req, res) => {
    uploadMiddleware(req, res, async (err) => {
        if (err) {
            console.error('❌ Multer Error:', err);
            return res.status(500).json({ error: err.message });
        }

        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        try {
            const { startTime, endTime } = req.body;
            console.log(`✂️ Processing: ${req.file.filename} (${startTime}s - ${endTime}s)`);

            const inputPath = req.file.path;
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
                    console.log('✅ Cut finished. Uploading to Fal...');
                    try {
                        const fileBuffer = fs.readFileSync(outputPath);
                        const blob = new Blob([fileBuffer], { type: 'video/mp4' });
                        
                        const url = await fal.storage.upload(blob);
                        console.log('🚀 Fal Uploaded:', url);
                        
                        // Cleanup
                        try { fs.unlinkSync(inputPath); fs.unlinkSync(outputPath); } catch(e) {}
                        
                        res.json({ url });
                    } catch (falErr) {
                        console.error('❌ Fal Upload Failed:', falErr);
                        res.status(500).json({ error: 'Fal upload failed. Check server logs.' });
                    }
                })
                .on('error', (ffmpegErr) => {
                    console.error('❌ FFmpeg Failed:', ffmpegErr);
                    if (ffmpegErr.message.includes('ffmpeg was not found')) {
                        console.error('👉 TIP: Run "sudo apt-get install ffmpeg" in your terminal');
                    }
                    res.status(500).json({ error: 'Video processing failed on server.' });
                })
                .run();

        } catch (error) {
            console.error('❌ General Error:', error);
            res.status(500).json({ error: error.message });
        }
    });
});

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