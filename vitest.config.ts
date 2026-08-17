import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Tolerates Windows file-lock errors when tests remove their temp DB dirs.
    setupFiles: ['./tests/setup/tolerantTempCleanup.ts'],
  },
  resolve: { alias: { '@': path.resolve(__dirname) } },
});
