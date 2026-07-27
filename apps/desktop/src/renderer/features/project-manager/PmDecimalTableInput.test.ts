import { describe, expect, it } from 'vitest'

import {
  formatPmDecimalDisplay,
  formatPmDecimalPlain,
  isPmPartialDecimalText,
  normalizePmDecimalText,
  parsePmDecimalInput,
} from './PmDecimalTableInput'

describe('PmDecimalTableInput helpers', () => {
  it('normalizes locale decimal separators', () => {
    expect(normalizePmDecimalText('1。5')).toBe('1.5')
    expect(normalizePmDecimalText('1．5')).toBe('1.5')
    expect(normalizePmDecimalText('1,5')).toBe('1.5')
  })

  it('strips thousand separators', () => {
    expect(normalizePmDecimalText('1,234')).toBe('1234')
    expect(normalizePmDecimalText('1,234.56')).toBe('1234.56')
    expect(normalizePmDecimalText('12,345,678')).toBe('12345678')
  })

  it('allows intermediate decimal strings', () => {
    expect(isPmPartialDecimalText('')).toBe(true)
    expect(isPmPartialDecimalText('.')).toBe(true)
    expect(isPmPartialDecimalText('1.')).toBe(true)
    expect(isPmPartialDecimalText('12.34')).toBe(true)
    expect(isPmPartialDecimalText('-0.')).toBe(true)
    expect(isPmPartialDecimalText('1.2.3')).toBe(false)
    expect(isPmPartialDecimalText('1a')).toBe(false)
  })

  it('parses empty and trailing-dot drafts', () => {
    expect(parsePmDecimalInput('')).toBeNull()
    expect(parsePmDecimalInput('.')).toBeNull()
    expect(parsePmDecimalInput('1.')).toBe(1)
    expect(parsePmDecimalInput('1.5')).toBe(1.5)
    expect(parsePmDecimalInput('1,234.5')).toBe(1234.5)
  })

  it('formats with thousand separators when |value| >= 1000', () => {
    expect(formatPmDecimalPlain(1234.5)).toBe('1234.5')
    expect(formatPmDecimalDisplay(999)).toBe('999')
    expect(formatPmDecimalDisplay(1000)).toBe('1,000')
    expect(formatPmDecimalDisplay(1234.5)).toBe('1,234.5')
    expect(formatPmDecimalDisplay(null)).toBe('')
  })
})
