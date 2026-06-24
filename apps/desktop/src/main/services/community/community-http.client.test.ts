import { describe, expect, it } from 'vitest'

import { buildMultipartBody } from './community-http.client'

describe('buildMultipartBody', () => {
  it('builds axum-compatible multipart with file field', () => {
    const { body, contentType } = buildMultipartBody([
      { name: 'version', value: '1.0.0' },
      { name: 'package', value: Buffer.from('zip-bytes'), filename: 'demo.toolman-mcp' },
    ])

    expect(contentType).toMatch(/^multipart\/form-data; boundary=toolman-[0-9a-f]+$/)
    const text = body.toString('utf8')
    expect(text).toContain('name="version"')
    expect(text).toContain('1.0.0')
    expect(text).toContain('filename="demo.toolman-mcp"')
    expect(text).toContain('zip-bytes')
    expect(text.endsWith('--\r\n')).toBe(true)
  })
})
