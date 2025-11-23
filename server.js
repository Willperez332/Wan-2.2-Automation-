import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { fal } from '@fal-ai/client';
import multer from 'multer';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Setup temporary storage for video processing
const upload = multer({ dest: 'uploads/' });

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'dist')));

fal.config({
    credentials: process.env.FAL_API_KEY,
});

// Helper: Cut video using FFmpeg
const cutVideo = (inputPath, startTime, duration, outputPath) => {
    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .setStartTime(startTime)
            .setDuration(duration)
            .output(outputPath)
            .on('end', () => resolve(outputPath))
            .on('error', (err) => reject(err))
            .run();
    });
};

// API: Cut specific segment and upload to Fal
app.post('/api/cut-and-upload', upload.single('video'), async (req, res) => {
    const inputPath = req.file.path;
    const { startTime, endTime } = req.body;
    const outputPath = `uploads/clip_${Date.now()}.mp4`;
    
    try {
        const duration = parseFloat(endTime) - parseFloat(startTime);
        
        // 1. Cut the video
        console.log(`Cutting video: ${startTime}s to ${endTime}s`);
        await cutVideo(inputPath, startTime, duration, outputPath);
        
        // 2. Read the cut clip
        const clipBuffer = fs.readFileSync(outputPath);
        
        // 3. Upload to Fal Storage
        console.log("Uploading clip to Fal...");
        const url = await fal.storage.upload(clipBuffer);
        
        // Cleanup temp files
        fs.unlinkSync(inputPath);
        fs.unlinkSync(outputPath);
        
        res.json({ url });
    } catch (error) {
        console.error("Cut/Upload Error:", error);
        // Cleanup on error
        if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        
        res.status(500).json({ error: 'Video processing failed' });
    }
});

// Keep existing upload/generate routes...
app.post('/api/upload', async (req, res) => {
    try {
        const { base64Data } = req.body;
        const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) return res.status(400).json({ error: 'Invalid base64' });
        const buffer = Buffer.from(matches[2], 'base64');
        const url = await fal.storage.upload(buffer);
        res.json({ url });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/generate', async (req, res) => {
    try {
        const { model, input } = req.body;
        console.log(`Generating with model: ${model}`);
        const result = await fal.subscribe(model, { input, logs: true });
        res.json(result);
    } catch (error) {
        console.error("Gen Error:", error);
        res.status(500).json({ error: error.message });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));