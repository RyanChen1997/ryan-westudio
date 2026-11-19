import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
export default defineConfig({ root: fileURLToPath(new URL('./modules/editor/gui/', import.meta.url)), plugins: [react()], build: { outDir: fileURLToPath(new URL('./dist/', import.meta.url)), emptyOutDir: true, assetsDir: 'app-assets' }, server: { host: '127.0.0.1' } });
