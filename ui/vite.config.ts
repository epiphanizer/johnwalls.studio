import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) return 'vendor-react';
          if (id.includes('node_modules/lucide-react')) return 'vendor-icons';
          if (id.includes('node_modules/jszip')) return 'vendor-zip';
          if (id.includes('/src/components/SP404')) return 'workspace-sp404';
          if (id.includes('/src/components/State')) return 'workspace-state';
          if (id.includes('/src/components/Pedal') || id.includes('/src/components/Stompbox')) return 'workspace-pedal';
          if (id.includes('/src/components/Studio')) return 'workspace-studio';
          return undefined;
        }
      }
    }
  },
  server: {
    port: 3010,
    host: true
  }
});
