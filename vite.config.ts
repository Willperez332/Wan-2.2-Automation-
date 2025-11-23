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
            target: 'https://queue.fal.run', // Default fallback
            changeOrigin: true,
            secure: true,
            // DYNAMIC ROUTER: Routes to Storage or Queue based on the SDK header
            router: (req) => {
                const target = req.headers['x-fal-target-url'];
                return typeof target === 'string' ? target : 'https://queue.fal.run';
            },
            rewrite: (path) => path.replace(/^\/api\/fal/, ''),
            headers: {
              'Authorization': `Key ${env.FAL_API_KEY}`,
            },
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