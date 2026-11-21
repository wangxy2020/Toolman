/**
 * Privileged protocol so renderer pdf.js workers can fetch cmaps / fonts / wasm
 * under production `loadFile` (file://) without CORS/fetch failures.
 */
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { dirname, join, normalize, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { net, protocol } from 'electron'

const SCHEME = 'tm-pdfjs'
const require = createRequire(import.meta.url)

export function registerPdfjsSchemePrivileged(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ])
}

function resolvePdfjsAssetRoot(): string {
  // Packaged / built renderer copy (written by electron-vite pdfjsAssetsPlugin).
  const built = join(__dirname, '../renderer/pdfjs')
  if (existsSync(built)) return built
  // Dev fallback: package contents.
  return dirname(require.resolve('pdfjs-dist/package.json'))
}

function safeAssetPath(root: string, urlPathname: string): string | null {
  const rel = decodeURIComponent(urlPathname.replace(/^\/+/, ''))
  if (!rel || rel.includes('..')) return null
  const absolute = normalize(join(root, rel))
  const rootWithSep = root.endsWith(sep) ? root : `${root}${sep}`
  if (absolute !== root && !absolute.startsWith(rootWithSep)) return null
  if (!existsSync(absolute)) return null
  return absolute
}

/** Call once after `app.whenReady()`. */
export function registerPdfjsProtocolHandler(): void {
  const root = resolvePdfjsAssetRoot()
  protocol.handle(SCHEME, (request) => {
    try {
      const parsed = new URL(request.url)
      // tm-pdfjs://local/cmaps/Foo.bcmap → pathname /cmaps/Foo.bcmap
      const filePath = safeAssetPath(root, parsed.pathname)
      if (!filePath) {
        return new Response('Not found', { status: 404 })
      }
      return net.fetch(pathToFileURL(filePath).href)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return new Response(message, { status: 500 })
    }
  })
}
