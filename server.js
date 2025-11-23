import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import * as falModule from '@fal-ai/client';
import multer from 'multer';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
// Ensure Blob is available for Node 18+
import { Blob } from 'buffer'; 

// --- CONFIGURATION ---
const fal = (falModule.default && falModule.default.fal) ? falModule.default.fal : (falModule.fal || falModule);
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

// Configure Multer limits
const upload = multer({ 
    storage: storage, 
    limits: { fileSize: 500 * 1024 * 1024 } // 500MB
});

// --- MIDDLEWARE ---

// 1. Debug Logger: Allows us to see if the request actually reached Node.js
app.use((req, res, next) => {
    console.log(`[${newDG().toISOString()}] Incoming Request: ${req.method} ${req.url}`);
    next();
});

// 2. Body parsers (for non-file requests)
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ limit: '500mb', extended: true }));

// 3. Serve Frontend
app.use(express.static(path.join(__dirname, 'dist')));

// 4. Fal Auth
if (fal && fal.config) fal.config({ credentials: process.env.FAL_API_KEY });


// --- ROUTES ---

// Helper to handle Multer errors gracefully
const uploadMiddleware = upload.single('video');

app.post('/api/cut-and-upload', (req, res) => {
    console.log('⚡️ processing /api/cut-and-upload request...');
    
    uploadMiddleware(req, res, async (err) => {
        if (err) {
            console.error('❌ Multer Upload Error:', err);
            // If this logs, the error is inside Node. If not, it's the Proxy.
            return res.status(500).json({ error: `Upload Failed: ${err.message}` });
        }

        if (!req.file) {
            console.error('❌ No file received in request');
            return res.status(400).json({ error: 'No video file provided' });
        }

        // Proceed to cutting logic
        try {
            const { startTime, endTime } = req.body;
            console.log(`🎬 File uploaded: ${req.file.originalname} (${(req.file.size / 1024 / 1024).toFixed(2)} MB)`);
            console.log(`✂️ Cutting from ${startTime}s to ${endTime}s`);

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
                    console.log('✅ FFmpeg Cut Success. Uploading to Fal...');
                    try {
                        const fileBuffer = fs.readFileSync(outputPath);
                        const blob = new Blob([fileBuffer], { type: 'video/mp4' });
                        const url = await fal.storage.upload(blob);
                        
                        console.log('🚀 Fal Upload Success:', url);
                        
                        // Cleanup
                        fs.unlinkSync(inputPath);
                        fs.unlinkSync(outputPath);
                        
                        res.json({ url });
                    } catch (falErr) {
                        console.error('❌ Fal Storage Error:', falErr);
                        res.status(500).json({ error: 'Fal upload failed' });
                    }
                })
                .on('error', (ffmpegErr) => {
                    console.error('❌ FFmpeg Error:', ffmpegErr);
                    res.status(500).json({ error: 'Video processing failed' });
                })
                .run();

        } catch (processError) {
            console.error('❌ Processing Error:', processError);
            res.status(500).json({ error: processError.message });
        }
    });
});

app.post('/api/generate', async (req, res) => {
    try {
        const { model, input } = req.body;
        console.log(`🎨 Sending generation request to ${model}`);
        
        const result = await fal.subscribe(model, {
            input,
            logs: true,
            onQueueUpdate: (update) => {
                if (update.status === 'IN_PROGRESS' && update.logs) {
                    update.logs.forEach(log => console.log('Fal Log:', log.message));
                }
            }
        });
        
        console.log('✨ Generation Complete');
        res.json(result);
    } catch (error) {
        console.error('❌ Generation Error:', error);
        res.status(500).json({ error: error.message || 'Generation failed' });
    }
});

app.listen(PORT, () => console.log(`\n⚡️ SERVER READY on port ${PORT}\n`));