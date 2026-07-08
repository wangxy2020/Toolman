import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('./runtime-app-settings.service.js', () => ({
  resolvePdfParserBackend: vi.fn(() => 'opendataloader'),
  resolveOdlHybridSettings: vi.fn(() => ({
    enabled: false,
    backend: 'docling-fast',
    url: 'http://localhost:5002',
    mode: 'full',
    hancomAiOcrStrategy: 'force',
  })),
  isDocumentOcrEnabled: vi.fn(() => true),
}))

vi.mock('@toolman/opendataloader', () => ({
  parsePdfWithOpenDataLoader: vi.fn(),
  getOpenDataLoaderAvailability: vi.fn(),
}))

vi.mock('@toolman/knowledge', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@toolman/knowledge')>()
  return {
    ...actual,
    parseFile: vi.fn(),
    defaultTitle: vi.fn((path: string) => path.split('/').pop() ?? path),
  }
})

import { parseFile } from '@toolman/knowledge'
import { parsePdfWithOpenDataLoader } from '@toolman/opendataloader'
import {
  resolveOdlHybridSettings,
  resolvePdfParserBackend,
} from './runtime-app-settings.service'
import {
  isPdfFilePath,
  parseIngestDocumentFile,
  shouldUseOpenDataLoaderForPdf,
} from './document-parser.service'

describe('document-parser.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(resolvePdfParserBackend).mockReturnValue('opendataloader')
    vi.mocked(resolveOdlHybridSettings).mockReturnValue({
      enabled: false,
      backend: 'docling-fast',
      url: 'http://localhost:5002',
      mode: 'full',
      hancomAiOcrStrategy: 'force',
    })
  })

  it('detects pdf paths', () => {
    expect(isPdfFilePath('/tmp/a.PDF')).toBe(true)
    expect(isPdfFilePath('/tmp/a.docx')).toBe(false)
  })

  it('uses OpenDataLoader for PDF when hybrid OCR is enabled even with builtin parser', () => {
    vi.mocked(resolvePdfParserBackend).mockReturnValue('builtin')
    vi.mocked(resolveOdlHybridSettings).mockReturnValue({
      enabled: true,
      backend: 'docling-fast',
      url: 'http://localhost:5002',
      mode: 'full',
      hancomAiOcrStrategy: 'force',
    })
    expect(shouldUseOpenDataLoaderForPdf('/tmp/scan.pdf')).toBe(true)
  })

  it('skips OpenDataLoader for PDF when builtin parser and hybrid OCR are off', () => {
    vi.mocked(resolvePdfParserBackend).mockReturnValue('builtin')
    vi.mocked(resolveOdlHybridSettings).mockReturnValue({
      enabled: false,
      backend: 'docling-fast',
      url: 'http://localhost:5002',
      mode: 'full',
      hancomAiOcrStrategy: 'force',
    })
    expect(shouldUseOpenDataLoaderForPdf('/tmp/scan.pdf')).toBe(false)
  })

  it('routes ingest pdf through OpenDataLoader when enabled', async () => {
    const body =
      'This is a digital PDF page with enough extracted text to pass quality checks for knowledge ingest indexing.'
    vi.mocked(parsePdfWithOpenDataLoader).mockResolvedValue({
      backend: 'opendataloader',
      totalPages: 1,
      plainText: `【第 1 页/1】\n${body}`,
      markdown: `【第 1 页/1】\n${body}`,
      pages: [{ pageNumber: 1, text: body }],
    })

    const result = await parseIngestDocumentFile({
      filePath: '/tmp/sample.pdf',
      workspaceId: 'ws',
      kbId: 'kb',
      parseOptions: {},
      parseTimeoutMs: 60_000,
    })

    expect(shouldUseOpenDataLoaderForPdf('/tmp/sample.pdf')).toBe(true)
    expect(parsePdfWithOpenDataLoader).toHaveBeenCalledOnce()
    expect(parseFile).not.toHaveBeenCalled()
    expect(result.kind).toBe('pdf')
    expect(result.plainText).toContain('digital PDF page')
  })

  it('falls back to parseFile when OpenDataLoader returns marker-only scanned shells', async () => {
    const markers = Array.from({ length: 48 }, (_, index) => `【第 ${index + 1} 页】`).join('\n')
    vi.mocked(parsePdfWithOpenDataLoader).mockResolvedValue({
      backend: 'opendataloader',
      totalPages: 48,
      plainText: markers,
      markdown: markers,
      pages: [],
    })
    vi.mocked(parseFile).mockResolvedValue({
      title: 'contract.pdf',
      plainText: '【第 1 页/48】\nOCR page one text',
      mimeType: 'application/pdf',
      kind: 'pdf',
    })

    const result = await parseIngestDocumentFile({
      filePath: '/tmp/contract.pdf',
      workspaceId: 'ws',
      kbId: 'kb',
      parseOptions: {
        pdfTextQuality: 'strict',
        ocr: {
          enabled: true,
          recognizePage: async () => '',
          recognizeImage: async () => '',
        },
      },
      parseTimeoutMs: 60_000,
    })

    expect(parseFile).toHaveBeenCalledOnce()
    expect(result.plainText).toContain('OCR page one text')
  })

  it('falls back to parseFile when OpenDataLoader returns empty text', async () => {
    vi.mocked(parsePdfWithOpenDataLoader).mockResolvedValue({
      backend: 'opendataloader',
      totalPages: 0,
      plainText: '',
      markdown: '',
      pages: [],
    })
    vi.mocked(parseFile).mockResolvedValue({
      title: 'sample.pdf',
      plainText: 'builtin text',
      mimeType: 'application/pdf',
      kind: 'pdf',
    })

    const result = await parseIngestDocumentFile({
      filePath: '/tmp/sample.pdf',
      workspaceId: 'ws',
      kbId: 'kb',
      parseOptions: {},
      parseTimeoutMs: 60_000,
    })

    expect(parseFile).toHaveBeenCalledOnce()
    expect(result.plainText).toBe('builtin text')
  })
})
