import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use('/api/fal', createProxyMiddleware({
    target: 'https://queue.fal.run',
    changeOrigin: true,
    pathRewrite: { '^/api/fal': '' },
    // Match the router logic from vite.config.ts
    router: (req) => {
        if (req.url.includes('/storage')) {
            return 'https://rest.alpha.fal.ai';
        }
        return 'https://queue.fal.run';
    },
    onProxyReq: (proxyReq) => {
        if (process.env.FAL_API_KEY) {
            proxyReq.setHeader('Authorization', `Key ${process.env.FAL_API_KEY}`);
        }
    }
}));

app.use(express.static(path.join(__dirname, 'dist')));

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});