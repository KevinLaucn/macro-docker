import { fileURLToPath } from 'node:url';
import solidPlugin from 'vite-plugin-solid';
import tsconfigPaths from 'vite-tsconfig-paths';

export default {
  root: fileURLToPath(new URL('../../../apps/web', import.meta.url)),
  plugins: [
    tsconfigPaths({
      projects: [
        fileURLToPath(
          new URL('../../../apps/web/tsconfig.json', import.meta.url)
        ),
      ],
    }),
    solidPlugin(),
  ],
  resolve: {
    alias: {
      '@queries': fileURLToPath(
        new URL('../../../apps/web/src/lib/queries', import.meta.url)
      ),
      '@service-storage': fileURLToPath(
        new URL(
          '../../../apps/web/src/lib/service-clients/service-storage',
          import.meta.url
        )
      ),
      '@app': fileURLToPath(new URL('../../../apps/web/src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    include: [
      fileURLToPath(new URL('./tests/*.integration.test.tsx', import.meta.url)),
    ],
  },
};
