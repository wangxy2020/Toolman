import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  createPdfjsLoadingOptions,
  resolvePdfjsAssetDir,
} from './pdfjs-options.js'

describe('pdfjs loading options', () => {
  it('points wasmUrl at the pdfjs-dist wasm folder', () => {
    const wasmUrl = resolvePdfjsAssetDir('wasm')
    expect(wasmUrl.endsWith('/')).toBe(true)
    expect(existsSync(join(wasmUrl, 'jbig2.wasm'))).toBe(true)

    const options = createPdfjsLoadingOptions(Buffer.from('%PDF-1.4'))
    expect(options.wasmUrl).toBe(wasmUrl)
    expect(options.cMapUrl?.endsWith('/')).toBe(true)
    expect(options.standardFontDataUrl?.endsWith('/')).toBe(true)
    expect(existsSync(join(options.cMapUrl!, 'Adobe-GB1-UCS2.bcmap'))).toBe(true)
  })
})
