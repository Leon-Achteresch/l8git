import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      { find: '@/lib/i18n', replacement: path.resolve(__dirname, 'lib/agents/i18n.ts') },
      { find: /^~\//, replacement: `${path.resolve(__dirname, '.')}/` },
      { find: /^@desktop\//, replacement: `${path.resolve(__dirname, '../src')}/` },
      { find: /^@\//, replacement: `${path.resolve(__dirname, '../src')}/` },
    ],
  },
  test: {
    include: ['lib/**/*.test.ts', 'components/**/*.test.ts'],
    environment: 'node',
  },
});
