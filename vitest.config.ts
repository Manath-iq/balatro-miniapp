import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'engine',
          include: ['tests/engine/**/*.test.ts', 'tests/content/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: { name: 'client', include: ['tests/client/**/*.test.ts'], environment: 'node' },
      },
    ],
  },
});
