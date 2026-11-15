import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.{test,spec}.ts'],
  },
  resolve: {
    alias: {
      '@client': path.resolve(__dirname, './src/client'),
      '@server': path.resolve(__dirname, './src/server'),
      '@shared': path.resolve(__dirname, './src/shared'),
    },
  },
});
