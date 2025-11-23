import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          '/api/fal': {
            target: 'https://queue.fal.run', // Default target
            changeOrigin: true,
            secure: true,
            // 1. INTELLIGENT ROUTER: Check the URL path
            router: (req) => {
                if (req.url && req.url.includes('/storage')) {
                    return 'https://rest.alpha.fal.ai';
                }
                return 'https://queue.fal.run';
            },
            // 2. REWRITE: Remove the /api/fal prefix
            rewrite: (path) => path.replace(/^\/api\/fal/, ''),
            
            // 3. FORCE AUTH HEADER: This replaces 'PROXY_USER' with your real key
            configure: (proxy, _options) => {
              proxy.on('proxyReq', (proxyReq, req, _res) => {
                proxyReq.setHeader('Authorization', `Key ${env.FAL_API_KEY}`);
              });
            }
          },
        },
      },
      plugins: [react()],
      define: {
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});