import { resolve } from 'node:path'
import type { RollupLog } from 'rollup'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

function suppressKnownRollupWarnings(warning: RollupLog, warn: (warning: RollupLog) => void): void {
  if (
    typeof warning.message === 'string' &&
    warning.message.includes('dynamic import will not move module into another chunk')
  ) {
    return
  }
  warn(warning)
}

const isReleaseBuild = process.env.TOOLMAN_RELEASE_BUILD === '1'
const bakedUpdateFeedUrl =
  process.env.TOOLMAN_UPDATE_FEED_URL?.trim() ??
  (isReleaseBuild ? 'https://releases.toolman.app' : '')
const bakedUpdateChannel = process.env.TOOLMAN_UPDATE_CHANNEL?.trim() ?? 'stable'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    define: {
      __TOOLMAN_UPDATE_FEED_URL__: JSON.stringify(bakedUpdateFeedUrl),
      __TOOLMAN_UPDATE_CHANNEL__: JSON.stringify(bakedUpdateChannel),
    },
    build: {
      reportCompressedSize: false,
      rollupOptions: {
        onwarn: suppressKnownRollupWarnings,
        input: {
          index: resolve('src/main/index.ts'),
          'workers/parse-file.worker': resolve('src/main/workers/parse-file.worker.ts'),
        },
      },
    },
    resolve: {
      alias: {
        '@main': resolve('src/main'),
        // Bundle workspace packages from source in main; predev builds dist for tsc (see package.json predev).
        '@toolman/shared': resolve('../../packages/shared/src/index.ts'),
        '@toolman/knowledge': resolve('../../packages/knowledge/src/index.ts'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      reportCompressedSize: false,
      rollupOptions: {
        onwarn: suppressKnownRollupWarnings,
      },
    },
    resolve: {
      alias: {
        '@preload': resolve('src/preload'),
      },
    },
  },
  renderer: {
    define: {
      __TOOLMAN_RELEASE_BUILD__: JSON.stringify(isReleaseBuild ? '1' : ''),
    },
    build: {
      reportCompressedSize: false,
    },
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
