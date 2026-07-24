import { describe, expect, it } from 'vitest'

import {
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
  })
})
