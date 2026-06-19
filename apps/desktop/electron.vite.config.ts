import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/main/index.ts'),
          'workers/parse-file.worker': resolve('src/main/workers/parse-file.worker.ts'),
        },
      },
    },
    resolve: {
      alias: {
        '@main': resolve('src/main'),
        '@toolman/shared': resolve('../../packages/shared/src/index.ts'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@preload': resolve('src/preload'),
      },
    },
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer'),
        // CJS dist breaks Rollup named exports; bundle from source in renderer
        '@toolman/shared': resolve('../../packages/shared/src/index.ts'),
      },
    },
    plugins: [react()],
  },
})
