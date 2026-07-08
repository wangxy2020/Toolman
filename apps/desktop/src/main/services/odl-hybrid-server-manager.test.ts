import { describe, expect, it } from 'vitest'
import { parseOdlHybridPort } from './odl-hybrid-server-manager.service'

describe('parseOdlHybridPort', () => {
  it('parses explicit localhost port', () => {
    expect(parseOdlHybridPort('http://localhost:5002')).toBe(5002)
  })

  it('defaults http to port 80', () => {
    expect(parseOdlHybridPort('http://127.0.0.1')).toBe(80)
  })

  it('defaults https to port 443', () => {
    expect(parseOdlHybridPort('https://localhost')).toBe(443)
  })
})
