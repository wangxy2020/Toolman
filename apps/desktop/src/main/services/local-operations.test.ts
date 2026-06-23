import { describe, expect, it } from 'vitest'
import { compareSemver } from './local-operations.service'

describe('compareSemver', () => {
  it('orders patch versions', () => {
    expect(compareSemver('0.1.1', '0.1.0')).toBeGreaterThan(0)
    expect(compareSemver('0.1.0', '0.1.1')).toBeLessThan(0)
  })

  it('treats equal versions as zero', () => {
    expect(compareSemver('0.1.0', '0.1.0')).toBe(0)
  })
})
