import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
// We use the Fal client HERE, on the server, where it is safe.
import { fal } from '@fal-ai/client';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Increase limit to handle base64 image uploads
app.use(express.json({ limit: '50mb' }));

// Configure Fal with the server-side key
fal.config({
    credentials: process.env.FAL_API_KEY,
});

// 1. API Route: Upload Image
app.post('/api/upload', async (req, res) => {
    try {
        const { base64Data, name } = req.body;
        
        // Convert base64 string back to a Buffer for Node.js upload
        const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) {
            return res.status(400).json({ error: 'Invalid base64 string' });
        }
        
        const buffer = Buffer.from(matches[2], 'base64');
        // Upload to Fal Storage
        const url = await fal.storage.upload(buffer);
        
        res.json({ url });
    } catch (error) {
        console.error("Server Upload Error:", error);
        res.status(500).json({ error: error.message || 'Upload failed' });
    }
});

// 2. API Route: Generate Video
app.post('/api/generate', async (req, res) => {
    try {
        const { model, input } = req.body;
        
        console.log(`Generating with model: ${model}`);
        
        // Execute the request to Fal
        const result = await fal.subscribe(model, {
            input: input,
            logs: true, 
        });
        
        res.json(result);
    } catch (error) {
        console.error("Server Generation Error:", error);
        res.status(500).json({ error: error.message || 'Generation failed' });
    }
});

// Serve the React App
app.use(express.static(path.join(__dirname, 'dist')));

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log("Fal API Mode: Server-Side Execution");
});