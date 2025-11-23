import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        // Proxy API calls to our local Express server (running on same port in prod, 
        // but for dev we need to point to where we might run the server if split)
        // Actually, for simple dev in Codespaces, we can just use the proxy to self or 
        // simpler: Run the full server.js for dev too (node server.js) OR:
        proxy: {
          '/api': 'http://localhost:3000' // Assuming you run node server.js on 3000
        }
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