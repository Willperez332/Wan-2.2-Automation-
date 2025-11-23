import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Secure Proxy for Fal.ai
app.use('/api/fal', createProxyMiddleware({
    target: 'https://queue.fal.run', // Default fallback
    changeOrigin: true,
    pathRewrite: { '^/api/fal': '' },
    // DYNAMIC ROUTER: Routes to Storage or Queue based on the SDK header
    router: (req) => {
        const target = req.headers['x-fal-target-url'];
        return typeof target === 'string' ? target : 'https://queue.fal.run';
    },
    onProxyReq: (proxyReq) => {
        if (process.env.FAL_API_KEY) {
            proxyReq.setHeader('Authorization', `Key ${process.env.FAL_API_KEY}`);
        }
    }
}));

// Serve the React App
app.use(express.static(path.join(__dirname, 'dist')));

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});