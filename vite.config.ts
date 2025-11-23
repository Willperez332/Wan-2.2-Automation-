import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    
    // DEBUG LOG: Check your terminal when you start the server
    console.log("--- VITE PROXY CONFIG ---");
    console.log("FAL KEY LOADED:", env.FAL_API_KEY ? "YES (Starts with " + env.FAL_API_KEY.substring(0, 5) + ")" : "NO - UNDEFINED");
    console.log("-------------------------");

    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          '/api/fal': {
            target: 'https://api.fal.ai',
            changeOrigin: true,
            secure: true,
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