import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import * as falModule from '@fal-ai/client';
// Handle ESM/CJS compatibility for Fal
const fal = (falModule.default && falModule.default.fal) ? falModule.default.fal : (falModule.fal || falModule);
import multer from 'multer';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const uploadDir = path.join(__dirname, 'uploads');
const tempDir = path.join(__dirname, 'temp');

// Ensure directories exist
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

// Configure Storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    // Keep original extension or default to mp4
    const ext = path.extname(file.originalname) || '.mp4';
    cb(null, `${file.fieldname}-${Date.now()}${ext}`);
  }
});
const upload = multer({ 
    storage: storage, 
    limits: { fileSize: 500 * 1024 * 1024 } // 500MB limit
});

// Middleware
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ limit: '500mb', extended: true }));

// Serve the frontend build (for production)
app.use(express.static(path.join(__dirname, 'dist')));

// Configure Fal
if (fal && fal.config) {
    fal.config({ 
        credentials: process.env.FAL_API_KEY 
    });
}

/**
 * ROUTE: CUT AND UPLOADER
 * 1. Receives full video
 * 2. Uses FFmpeg to cut the specific segment
 * 3. Uploads the cut segment to Fal.ai storage
 * 4. Returns the Fal URL to the frontend
 */
app.post('/api/cut-and-upload', upload.single('video'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No video file provided' });
    
    const { startTime, endTime } = req.body;
    const inputPath = req.file.path;
    const outputFilename = `cut-${Date.now()}.mp4`;
    const outputPath = path.join(tempDir, outputFilename);

    const duration = parseFloat(endTime) -HZparseFloat(startTime);

    console.log(`✂️ Cutting video: ${inputPath} from ${startTime}s for ${duration}s`);

    ffmpeg(inputPath)
        .setStartTime(startTime)
        .setDuration(duration)
        // Force re-encoding to ensure frame-perfect cuts for AI input
        // "copy" codec is faster but can result in frozen frames at start if not on keyframe
        .videoCodec('libx264') 
        .audioCodec('aac')
        .output(outputPath)
        .on('end', async () => {
            console.log('✅ Video cut successfully. Uploading to Fal...');
            
            try {
                // Read the file into a buffer for upload
                const fileData = fs.readFileSync(outputPath);
                
                // Convert Buffer to Blob-like object for Fal (if required by version)
                // Or try uploading strictly as binary if supported
                const blob = new Blob([fileData], { type: 'video/mp4' });

                const url = await fal.storage.upload(blob);
                
                console.log('🚀 Uploaded to Fal:', url);

                // Cleanup temp files
                fs.unlinkSync(inputPath);
                fs.unlinkSync(outputPath);

                res.json({ url });
            } catch (uploadError) {
                console.error('Upload to Fal failed:', uploadError);
                res.status(500).json({ error: 'Failed to upload cut video to Fal' });
            }
        })
        .on('error', (err) => {
            console.error('FFmpeg error:', err);
            res.status(500).json({ error: 'Video processing failed' });
        })
        .run();
});

/**
 * ROUTE: GENERATE
 * Proxies the request to Fal.ai to protect the API Key
 */
app.post('/api/generate', async (req, res) => {
    try {
        const { model, input } = req.body;
        console.log(`🎨 Generating with model: ${model}`);

        // Subscribe to the queue and wait for result
        const result = await fal.subscribe(model, {
            input: input,
            logsXB: true,
            onQueueUpdate: (update) => {
                if (update.status === 'IN_PROGRESS') {
                    if (update.logs) update.logs.map((log) => console.log('Fal Log:', log.message));
                }
            },
        });

        res.json(result);
    } catch (error) {
        console.error('Generation failed:', error);
        res.status(500).json({ error: error.message || 'Generation failed' });
    }
});

app.listen(PORT, () => console.log(`⚡️ Server running on port ${PORT}`));