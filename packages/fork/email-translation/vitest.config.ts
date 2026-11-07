import solidPlugin from 'vite-plugin-solid';
import solidSvg from 'vite-plugin-solid-svg';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    tsconfigPaths({
      projects: [
        './tsconfig.json',
        '../read-receipts/tsconfig.json',
        '../../../apps/web/tsconfig.json',
      ],
      loose: true,
    }),
    solidPlugin(),
    solidSvg({ defaultAsComponent: true }),
  ],
  resolve: {
    dedupe: ['solid-js'],
  },
  ssr: {
    resolve: {
      conditions: ['browser', 'development'],
    },
  },
  test: {
    environment: 'jsdom',
    include: ['**/*.{test,spec}.{ts,tsx}'],
  },
});
