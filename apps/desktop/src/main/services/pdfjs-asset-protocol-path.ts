import { extname, relative, resolve, sep } from 'node:path'

export const PDFJS_ASSET_SCHEME = 'toolman-pdfjs'
export const PDFJS_ASSET_HOST = 'bundle'
export const PDFJS_DOC_HOST = 'doc'
export const PDFJS_ASSET_ALLOWED_DIRS = ['cmaps', 'standard_fonts', 'wasm', 'iccs'] as const
export const PDFJS_MAX_RANGE_BYTES = 32 * 1024 * 1024

const allowedDirSet = new Set<string>(PDFJS_ASSET_ALLOWED_DIRS)

function withTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`
}

export function mimeForPdfjsAsset(filePath: string): string {
  switch (extname(filePath).toLowerCase()) {
    case '.wasm':
      return 'application/wasm'
    case '.js':
    case '.mjs':
      return 'text/javascript'
    case '.json':
      return 'application/json'
    default:
      return 'application/octet-stream'
  }
}

/** Map `toolman-pdfjs://bundle/cmaps/foo.bcmap` onto a file under the pdf.js package. */
export function resolvePdfjsProtocolFile(root: string, requestUrl: string): string | null {
  let url: URL
  try {
    url = new URL(requestUrl)
  } catch {
    return null
  }
  if (url.protocol !== `${PDFJS_ASSET_SCHEME}:`) return null
  const rel = decodeURIComponent((url.pathname || '').replace(/^\/+/, ''))
  if (!rel || rel.includes('\0')) return null
  const first = rel.split(/[/\\]/)[0]
  if (!first || !allowedDirSet.has(first)) return null
  const abs = resolve(root, rel)
  const relToRoot = relative(root, abs)
  if (!relToRoot || relToRoot.startsWith(`..${sep}`) || relToRoot === '..' || relToRoot.split(sep).includes('..')) {
    return null
  }
  return abs
}

export function pdfjsAssetBaseUrl(subdir: string): string {
  const trimmed = subdir.replace(/^\/+|\/+$/g, '')
  return withTrailingSlash(`${PDFJS_ASSET_SCHEME}://${PDFJS_ASSET_HOST}/${trimmed}`)
}

export function pdfjsDocumentUrl(filePath: string): string {
  return `${PDFJS_ASSET_SCHEME}://${PDFJS_DOC_HOST}/pdf?path=${encodeURIComponent(filePath)}`
}

export function resolvePdfjsDocumentPath(requestUrl: string): string | null {
  let url: URL
  try {
    url = new URL(requestUrl)
  } catch {
    return null
  }
  if (url.protocol !== `${PDFJS_ASSET_SCHEME}:`) return null
  if (url.hostname !== PDFJS_DOC_HOST) return null
  const path = url.searchParams.get('path')?.trim() ?? ''
  return path || null
}

/** Inclusive byte range from a `Range` header. */
export function parseBytesRangeHeader(header: string | null, size: number): { start: number; end: number } | null {
  if (!header || size <= 0) return null
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim())
  if (!match) return null
  const startToken = match[1] ?? ''
  const endToken = match[2] ?? ''
  if (startToken === '' && endToken === '') return null
  let start: number
  let end: number
  if (startToken === '') {
    const suffix = Number(endToken)
    if (!Number.isInteger(suffix) || suffix <= 0) return null
    start = Math.max(0, size - suffix)
    end = size - 1
  } else {
    start = Number(startToken)
    end = endToken === '' ? size - 1 : Number(endToken)
    if (!Number.isInteger(start) || !Number.isInteger(end)) return null
  }
  if (start < 0 || end < start || start >= size) return null
  return { start, end: Math.min(end, size - 1) }
}

export function parseContentRangeSize(header: string | null): number | null {
  const match = /\/(\d+)\s*$/.exec(header ?? '')
  if (!match) return null
  const size = Number(match[1])
  return Number.isInteger(size) && size > 0 ? size : null
}
