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

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// Configure Multer to preserve extensions (FFmpeg likes extensions)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir)
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    // Default to .mp4 if no extension
    const ext = path.extname(file.originalname) || '.mp4';
    cb(null, file.fieldname + '-' + uniqueSuffix + ext)
  }
})

const upload = multer({ storage: storage });

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'dist')));

fal.config({
    credentials: process.env.FAL_API_KEY,
});

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

app.post('/api/cut-and-upload', upload.single('video'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No video file provided' });
    
    const inputPath = req.file.path;
    const { startTime, endTime } = req.body;
    const outputPath = path.join(uploadDir, `clip_${Date.now()}.mp4`);
    
    try {
        const duration = parseFloat(endTime) - parseFloat(startTime);
        console.log(`Cutting video: ${startTime}s -> ${endTime}s (Duration: ${duration}s)`);
        
        await cutVideo(inputPath, startTime, duration, outputPath);
        
        console.log("Uploading cut clip to Fal...");
        const clipBuffer = fs.readFileSync(outputPath);
        const url = await fal.storage.upload(clipBuffer);
        
        // Cleanup
        try { fs.unlinkSync(inputPath); } catch (e) {}
        try { fs.unlinkSync(outputPath); } catch (e) {}
        
        res.json({ url });
    } catch (error) {
        console.error("Cut/Upload Error:", error);
        res.status(500).json({ error: 'Video processing failed: ' + error.message });
    }
});

app.post('/api/upload', async (req, res) => {
    try {
        const { base64Data } = req.body;
        const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) return res.status(400).json({ error: 'Invalid base64' });
        
        const buffer = Buffer.from(matches[2], 'base64');
        const url = await fal.storage.upload(buffer);
        res.json({ url });
    } catch (error) {
        console.error("Upload Error:", error);
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
        console.error("Generation Error:", error);
        res.status(500).json({ error: error.message });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});