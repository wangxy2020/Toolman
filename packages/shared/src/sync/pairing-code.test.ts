import { describe, expect, it } from 'vitest'
import {
  generateShortPairingCode,
  isLegacyDevicePairingOfferCode,
  isShortPairingCode,
  isToolmanPublicWebHostname,
  normalizePairingCode,
  SHORT_PAIRING_CODE_LENGTH,
} from './pairing-code.js'

describe('short pairing code', () => {
  it('normalizes case and separators', () => {
    expect(normalizePairingCode(' ab-3k ')).toBe('AB3K')
    expect(isShortPairingCode('ab3k')).toBe(true)
    expect(isShortPairingCode('AB1O')).toBe(false)
    expect(isShortPairingCode('ABC')).toBe(false)
    expect(isLegacyDevicePairingOfferCode('tm1.abc')).toBe(true)
  })

  it('generates a 4-character readable code', () => {
    const code = generateShortPairingCode()
    expect(code).toHaveLength(SHORT_PAIRING_CODE_LENGTH)
    expect(isShortPairingCode(code)).toBe(true)
  })

  it('recognizes hosted Toolman web hosts', () => {
    expect(isToolmanPublicWebHostname('www.toolman.work')).toBe(true)
    expect(isToolmanPublicWebHostname('toolman.work')).toBe(true)
    expect(isToolmanPublicWebHostname('hub.toolman.app')).toBe(false)
  })
})
