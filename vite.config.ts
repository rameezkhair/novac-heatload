import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: { rollupOptions: { input: { main: 'index.html', app: 'app.html', heatloadCalculator: 'heatload-calculator/index.html' } } },
  test: { environment: 'node' },
} as any);
