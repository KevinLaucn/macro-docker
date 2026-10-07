import solidPlugin from 'vite-plugin-solid';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [tsconfigPaths(), solidPlugin()],
  resolve: { dedupe: ['solid-js'] },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
  },
});
