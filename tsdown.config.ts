import { defineConfig } from 'tsdown'

/**
 * Client bundle for the module-loader table: CJS-shaped output whose only
 * externals are the frozen platform entries (react, ui-primitives). The
 * post-build script wraps it as window.__ModuleLoader__.load(...).
 */
export default defineConfig({
  entry: { client: 'src/client/index.tsx' },
  outDir: 'client',
  format: ['cjs'],
  platform: 'browser',
  target: 'es2022',
  sourcemap: true,
  clean: true,
  dts: false,
  deps: {
    neverBundle: [
      'react',
      'react/jsx-runtime',
      'react-dom',
      '@deepseek-ai/dsh-client-ui-primitives',
    ],
  },
})
