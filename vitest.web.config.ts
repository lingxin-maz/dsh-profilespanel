import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      '@deepseek-ai/dsh-client-ui-primitives': fileURLToPath(
        new URL('./tests/client/mocks/primitives.tsx', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/client/**/*.test.tsx'],
    setupFiles: ['tests/client/setup.ts'],
  },
})
