import { app, net, protocol } from 'electron'
import { createRequire } from 'node:module'
import { existsSync, statSync } from 'node:fs'
import { open } from 'node:fs/promises'
import { dirname, extname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  mimeForPdfjsAsset,
  parseBytesRangeHeader,
  PDFJS_ASSET_SCHEME,
  PDFJS_DOC_HOST,
  PDFJS_MAX_RANGE_BYTES,
  resolvePdfjsDocumentPath,
  resolvePdfjsProtocolFile,
} from './pdfjs-asset-protocol-path'
import { assertUserAccessiblePath } from './path-sandbox.service'

export {
  mimeForPdfjsAsset,
  PDFJS_ASSET_ALLOWED_DIRS,
  PDFJS_ASSET_HOST,
  PDFJS_ASSET_SCHEME,
  pdfjsAssetBaseUrl,
  pdfjsDocumentUrl,
  resolvePdfjsProtocolFile,
} from './pdfjs-asset-protocol-path'

const require = createRequire(import.meta.url)

let schemeRegistered = false
let protocolRegistered = false

const PDF_HEADERS = {
  'Content-Type': 'application/pdf',
  'Accept-Ranges': 'bytes',
} as const

export function resolvePdfjsPackageRoot(): string {
  try {
    return dirname(require.resolve('pdfjs-dist/package.json'))
  } catch {
    const buildEntry = require.resolve('pdfjs-dist/build/pdf.mjs')
    return join(dirname(buildEntry), '..', '..')
  }
}

export function registerPdfjsAssetScheme(): void {
  if (schemeRegistered || app.isReady()) return
  protocol.registerSchemesAsPrivileged([
    {
      scheme: PDFJS_ASSET_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ])
  schemeRegistered = true
}

function pdfHeaders(extra?: Record<string, string>): Headers {
  return new Headers({ ...PDF_HEADERS, ...extra })
}

async function serveUserPdf(request: Request): Promise<Response> {
  const rawPath = resolvePdfjsDocumentPath(request.url)
  if (!rawPath) return new Response('Not found', { status: 404 })
  let filePath: string
  try {
    filePath = assertUserAccessiblePath(rawPath)
  } catch {
    return new Response('Forbidden', { status: 403 })
  }
  if (extname(filePath).toLowerCase() !== '.pdf' || !existsSync(filePath)) {
    return new Response('Not found', { status: 404 })
  }
  const size = statSync(filePath).size
  if (request.method === 'HEAD') {
    return new Response(null, {
      status: 200,
      headers: pdfHeaders({ 'Content-Length': String(size) }),
    })
  }
  const range = parseBytesRangeHeader(request.headers.get('Range'), size)
  if (!range) {
    return new Response(null, {
      status: request.method === 'HEAD' ? 200 : 416,
      headers: pdfHeaders({
        'Content-Length': request.method === 'HEAD' ? String(size) : '0',
        'Content-Range': `bytes */${size}`,
      }),
    })
  }
  const length = range.end - range.start + 1
  if (length > PDFJS_MAX_RANGE_BYTES) {
    return new Response('Range too large', { status: 416 })
  }
  const handle = await open(filePath, 'r')
  try {
    const buf = Buffer.alloc(length)
    const { bytesRead } = await handle.read(buf, 0, length, range.start)
    return new Response(buf.subarray(0, bytesRead), {
      status: 206,
      headers: pdfHeaders({
        'Content-Length': String(bytesRead),
        'Content-Range': `bytes ${range.start}-${range.start + bytesRead - 1}/${size}`,
      }),
    })
  } finally {
    await handle.close()
  }
}

export function registerPdfjsAssetProtocol(): void {
  if (protocolRegistered) return
  const root = resolvePdfjsPackageRoot()
  protocol.handle(PDFJS_ASSET_SCHEME, (request) => {
    let url: URL
    try {
      url = new URL(request.url)
    } catch {
      return new Response('Not found', { status: 404 })
    }
    if (url.hostname === PDFJS_DOC_HOST) {
      return serveUserPdf(request)
    }
    const abs = resolvePdfjsProtocolFile(root, request.url)
    if (!abs) {
      return new Response('Not found', { status: 404 })
    }
    return net.fetch(pathToFileURL(abs).href).then((response) => {
      if (!response.ok) return response
      const headers = new Headers(response.headers)
      headers.set('content-type', mimeForPdfjsAsset(abs))
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      })
    }).catch(() => new Response('Not found', { status: 404 }))
  })
  protocolRegistered = true
}
