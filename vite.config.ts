import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
export default defineConfig({ plugins: [react()], define: { 'import.meta.env.VITE_RELEASE': JSON.stringify(process.env.GITHUB_SHA?.slice(0, 7) ?? 'local') }, base: './', build: { rolldownOptions: { input: {
  main: fileURLToPath(new URL('./index.html', import.meta.url)),
  illustrations: fileURLToPath(new URL('./illustrations.html', import.meta.url)),
} } } });
