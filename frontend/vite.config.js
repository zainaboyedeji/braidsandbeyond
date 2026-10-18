import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    server: {
      port: 5173,
      // Dev: /api/* is forwarded to Express, so no CORS setup is needed locally
      proxy: {
        '/api': env.VITE_DEV_API_TARGET || 'http://localhost:5000',
      },
    },
  };
});
