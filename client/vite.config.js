import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the client runs on :5173 and forwards /api to the Express server,
// so the browser sees one origin and the session cookie works.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
});
