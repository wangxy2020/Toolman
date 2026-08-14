import { describe, expect, it } from 'vitest'
import type { PdfParserBackend as SharedPdfParserBackend } from '@toolman/shared'
import type { PdfParserBackend as OdlPdfParserBackend } from '@toolman/opendataloader'
import { P2pConnectionStateSchema } from '@toolman/shared'
import { parseNativeConnectionState } from './services/p2p/p2p-connection-state'

type AssertEqual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never

const _pdfParserBackendsMatch: AssertEqual<SharedPdfParserBackend, OdlPdfParserBackend> = true

describe('package boundary types', () => {
  it('keeps shared and opendataloader PDF parser backends aligned', () => {
    expect(_pdfParserBackendsMatch).toBe(true)
  })

  it('parses native P2P connection states through the shared schema', () => {
    for (const state of P2pConnectionStateSchema.options) {
      expect(parseNativeConnectionState(state)).toBe(state)
    }
    expect(parseNativeConnectionState('not-a-state')).toBe('idle')
    expect(parseNativeConnectionState('not-a-state', 'connecting')).toBe('connecting')
  })
})
