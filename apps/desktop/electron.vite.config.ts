import { createRequire } from 'node:module'
import { cpSync, createReadStream, existsSync, statSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import type { RollupLog } from 'rollup'
import type { Plugin } from 'vite'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const require = createRequire(import.meta.url)

function suppressKnownRollupWarnings(warning: RollupLog, warn: (warning: RollupLog) => void): void {
  if (
    typeof warning.message === 'string' &&
    warning.message.includes('dynamic import will not move module into another chunk')
  ) {
    return
  }
  warn(warning)
}

/** Serve / copy pdf.js cmaps, fonts, wasm, iccs for renderer canvas preview. */
function pdfjsAssetsPlugin(): Plugin {
  const pdfjsRoot = dirname(require.resolve('pdfjs-dist/package.json'))
  const assetDirs = ['cmaps', 'standard_fonts', 'wasm', 'iccs'] as const

  const contentType = (filePath: string): string => {
    switch (extname(filePath).toLowerCase()) {
      case '.bcmap':
        return 'application/octet-stream'
      case '.pfb':
      case '.ttf':
        return 'application/octet-stream'
      case '.wasm':
        return 'application/wasm'
      case '.json':
        return 'application/json'
      default:
        return 'application/octet-stream'
    }
  }

  const copyTo = (destRoot: string) => {
    for (const dir of assetDirs) {
      const from = join(pdfjsRoot, dir)
      if (!existsSync(from)) continue
      cpSync(from, join(destRoot, 'pdfjs', dir), { recursive: true })
    }
  }

  return {
    name: 'toolman-pdfjs-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/pdfjs/')) return next()
        const rel = decodeURIComponent((req.url.slice('/pdfjs/'.length).split('?')[0] ?? '').replace(/^\/+/, ''))
        if (!rel || rel.includes('..')) {
          res.statusCode = 400
          res.end('Bad request')
          return
        }
        const filePath = join(pdfjsRoot, rel)
        if (!filePath.startsWith(pdfjsRoot) || !existsSync(filePath) || !statSync(filePath).isFile()) {
          res.statusCode = 404
          res.end('Not found')
          return
        }
        res.setHeader('Content-Type', contentType(filePath))
        createReadStream(filePath).pipe(res)
      })
    },
    writeBundle(options) {
      if (options.dir) copyTo(options.dir)
    },
  }
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
          'workers/db.worker': resolve('src/main/workers/db.worker.ts'),
          'workers/pdf-preview.worker': resolve('src/main/workers/pdf-preview.worker.ts'),
        },
      },
    },
    resolve: {
      alias: {
        '@main': resolve('src/main'),
        // Bundle workspace packages from source in main.
        // Husky typecheck uses package.json → dist after `^build` (composite tsconfig
        // cannot path-map those sources without TS6307).
        '@toolman/shared': resolve('../../packages/shared/src/index.ts'),
        '@toolman/knowledge': resolve('../../packages/knowledge/src/index.ts'),
        '@toolman/db': resolve('../../packages/db/src/index.ts'),
        '@toolman/model-gateway': resolve('../../packages/model-gateway/src/index.ts'),
        '@toolman/opendataloader': resolve('../../packages/opendataloader/src/index.ts'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ['@toolman/shared'] })],
    build: {
      reportCompressedSize: false,
      rollupOptions: {
        onwarn: suppressKnownRollupWarnings,
      },
    },
    resolve: {
      alias: {
        '@preload': resolve('src/preload'),
        '@toolman/shared': resolve('../../packages/shared/src/index.ts'),
      },
    },
  },
  renderer: {
    define: {
      __TOOLMAN_RELEASE_BUILD__: JSON.stringify(isReleaseBuild ? '1' : ''),
    },
    optimizeDeps: {
      include: ['rehype-raw'],
      // Main-process packages; never pre-bundle native .node bindings for the renderer.
      exclude: [
        '@toolman/knowledge',
        '@toolman/opendataloader',
        '@lancedb/lancedb',
        '@napi-rs/canvas',
      ],
    },
    worker: {
      format: 'es',
    },
    build: {
      reportCompressedSize: false,
      ...(isReleaseBuild
        ? {
            esbuild: {
              drop: ['console', 'debugger'],
            },
          }
        : {}),
    },
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer'),
        // CJS dist breaks Rollup named exports; bundle from source in renderer
        '@toolman/shared': resolve('../../packages/shared/src/index.ts'),
      },
    },
    plugins: [react(), pdfjsAssetsPlugin()],
  },
})
