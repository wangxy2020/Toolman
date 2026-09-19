import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  mimeForPdfjsAsset,
  parseBytesRangeHeader,
  parseContentRangeSize,
  pdfjsAssetBaseUrl,
  pdfjsDocumentUrl,
  resolvePdfjsDocumentPath,
  resolvePdfjsProtocolFile,
} from './pdfjs-asset-protocol-path'

describe('pdfjs-asset-protocol', () => {
  const root = '/tmp/pdfjs-dist'

  it('maps cmap/font/wasm URLs onto the package folder', () => {
    expect(resolvePdfjsProtocolFile(root, 'toolman-pdfjs://bundle/cmaps/Adobe-GB1-UCS2.bcmap')).toBe(
      join(root, 'cmaps/Adobe-GB1-UCS2.bcmap'),
    )
    expect(resolvePdfjsProtocolFile(root, 'toolman-pdfjs://bundle/wasm/jbig2.wasm')).toBe(
      join(root, 'wasm/jbig2.wasm'),
    )
    expect(resolvePdfjsProtocolFile(root, 'toolman-pdfjs://bundle/standard_fonts/FoxitFixed.pfb')).toBe(
      join(root, 'standard_fonts/FoxitFixed.pfb'),
    )
  })

  it('rejects path traversal and unrelated folders', () => {
    expect(resolvePdfjsProtocolFile(root, 'toolman-pdfjs://bundle/cmaps/../../package.json')).toBeNull()
    expect(resolvePdfjsProtocolFile(root, 'toolman-pdfjs://bundle/build/pdf.mjs')).toBeNull()
    expect(resolvePdfjsProtocolFile(root, 'https://example.com/cmaps/foo.bcmap')).toBeNull()
  })

  it('builds trailing-slash asset bases for pdf.js', () => {
    expect(pdfjsAssetBaseUrl('cmaps')).toBe('toolman-pdfjs://bundle/cmaps/')
    expect(pdfjsAssetBaseUrl('/wasm/')).toBe('toolman-pdfjs://bundle/wasm/')
  })

  it('uses the wasm MIME so Chromium will instantiate the module', () => {
    expect(mimeForPdfjsAsset('/tmp/jbig2.wasm')).toBe('application/wasm')
    expect(mimeForPdfjsAsset('/tmp/Adobe-GB1-UCS2.bcmap')).toBe('application/octet-stream')
  })

  it('encodes a user PDF path for range fetches', () => {
    const url = pdfjsDocumentUrl('/Users/me/合同.pdf')
    expect(url).toContain('toolman-pdfjs://doc/pdf?path=')
    expect(resolvePdfjsDocumentPath(url)).toBe('/Users/me/合同.pdf')
    expect(resolvePdfjsDocumentPath('toolman-pdfjs://bundle/cmaps/foo.bcmap')).toBeNull()
  })

  it('parses inclusive byte ranges including suffix requests', () => {
    expect(parseBytesRangeHeader('bytes=0-65535', 1_000_000)).toEqual({ start: 0, end: 65535 })
    expect(parseBytesRangeHeader('bytes=100-', 250)).toEqual({ start: 100, end: 249 })
    expect(parseBytesRangeHeader('bytes=-10', 100)).toEqual({ start: 90, end: 99 })
    expect(parseBytesRangeHeader('bytes=0-0', 80)).toEqual({ start: 0, end: 0 })
    expect(parseBytesRangeHeader('bytes=500-10', 80)).toBeNull()
    expect(parseContentRangeSize('bytes 0-0/2488321')).toBe(2488321)
  })
})
