import { describe, expect, it } from 'vitest'
import { hostnameFromHostOrUrl } from '@toolman/shared'

describe('hostnameFromHostOrUrl', () => {
  it('parses Expo hostUri and Hub URLs', () => {
    expect(hostnameFromHostOrUrl('192.168.1.8:8081')).toBe('192.168.1.8')
    expect(hostnameFromHostOrUrl('http://100.64.1.8:3721/')).toBe('100.64.1.8')
    expect(hostnameFromHostOrUrl('localhost:8081')).toBe('localhost')
  })
})
