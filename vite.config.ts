import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: { port: 1420, strictPort: true, watch: { ignored: ['**/src-tauri/**'] } },
  clearScreen: false,
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks: {
          terminal: ['@xterm/xterm', '@xterm/addon-fit'],
          editor: [
            '@codemirror/view',
            '@codemirror/state',
            '@codemirror/language',
            '@codemirror/commands',
            '@codemirror/search',
          ],
        },
      },
    },
  },
});
