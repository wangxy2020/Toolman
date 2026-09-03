import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)

function withTrailingSlash(dir: string): string {
  const normalized = dir.replaceAll('\\', '/')
  return normalized.endsWith('/') ? normalized : `${normalized}/`
}

export function resolvePdfjsPackageRoot(): string {
  try {
    return dirname(require.resolve('pdfjs-dist/package.json'))
  } catch {
    const buildEntry = require.resolve('pdfjs-dist/legacy/build/pdf.mjs')
    return join(dirname(buildEntry), '..', '..')
  }
}

/** pdf.js 6 requires trailing slashes; Node's BinaryDataFactory reads these as filesystem paths. */
export function resolvePdfjsAssetDir(subdir: string): string {
  return withTrailingSlash(join(resolvePdfjsPackageRoot(), subdir))
}

export function createPdfjsLoadingOptions(buffer: Buffer) {
  return {
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    disableFontFace: true,
    password: '',
    isEvalSupported: false,
    stopAtErrors: false,
    wasmUrl: resolvePdfjsAssetDir('wasm'),
    cMapUrl: resolvePdfjsAssetDir('cmaps'),
    cMapPacked: true,
    standardFontDataUrl: resolvePdfjsAssetDir('standard_fonts'),
    iccUrl: resolvePdfjsAssetDir('iccs'),
  }
}

export async function loadPdfjsDocument(buffer: Buffer, timeoutMs = 120_000) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const loadingTask = pdfjs.getDocument(createPdfjsLoadingOptions(buffer))

  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const documentPromise = loadingTask.promise

  try {
    return await Promise.race([
      documentPromise,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          void loadingTask.destroy()
          reject(new Error('PDF 加载超时，可能是加密文件或文件损坏'))
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}
