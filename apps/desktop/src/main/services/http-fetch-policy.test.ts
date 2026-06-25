import { describe, expect, it } from 'vitest'
import { assertHttpFetchUrlAllowed } from './http-fetch-policy'

describe('http-fetch-policy', () => {
  it('allows public https urls', () => {
    expect(assertHttpFetchUrlAllowed('https://example.com/api').hostname).toBe('example.com')
  })

  it('blocks localhost', () => {
    expect(() => assertHttpFetchUrlAllowed('http://127.0.0.1:8080')).toThrow('本地或内网')
    expect(() => assertHttpFetchUrlAllowed('http://localhost/status')).toThrow('本地或内网')
  })

  it('blocks link-local ipv4', () => {
    expect(() => assertHttpFetchUrlAllowed('http://169.254.0.1/status')).toThrow('本地或内网')
  })

  it('blocks credentials in url', () => {
    expect(() => assertHttpFetchUrlAllowed('https://user:pass@example.com')).toThrow('用户名或密码')
  })

  it('blocks private ipv4', () => {
    expect(() => assertHttpFetchUrlAllowed('http://192.168.1.10/status')).toThrow('本地或内网')
  })

  it('blocks non-http protocols', () => {
    expect(() => assertHttpFetchUrlAllowed('file:///etc/passwd')).toThrow('仅支持 http/https')
  })
})
