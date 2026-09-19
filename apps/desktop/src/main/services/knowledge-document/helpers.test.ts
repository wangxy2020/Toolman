import { describe, expect, it } from 'vitest'
import { toDocument } from './helpers'

describe('toDocument', () => {
  it('surfaces parse warnings on ready documents', () => {
    const doc = toDocument(
      {
        id: '11111111-1111-4111-8111-111111111111',
        kbId: '22222222-2222-4222-8222-222222222222',
        title: 'scan.pdf',
        contentHash: null,
        mimeType: 'application/pdf',
        status: 'ready',
        absolutePath: '/tmp/scan.pdf',
        errorJson: JSON.stringify({ message: 'PDF 部分页面解析失败（10/12 页可用）。失败页：11, 12' }),
        createdAt: new Date(1),
        updatedAt: new Date(1),
      },
      8,
    )
    expect(doc.status).toBe('ready')
    expect(doc.errorMessage).toContain('失败页：11, 12')
  })

  it('hides stale errors while queued', () => {
    const doc = toDocument(
      {
        id: '11111111-1111-4111-8111-111111111111',
        kbId: '22222222-2222-4222-8222-222222222222',
        title: 'scan.pdf',
        contentHash: null,
        mimeType: 'application/pdf',
        status: 'queued',
        absolutePath: '/tmp/scan.pdf',
        errorJson: JSON.stringify({ message: '索引任务已取消' }),
        createdAt: new Date(1),
        updatedAt: new Date(1),
      },
      0,
    )
    expect(doc.errorMessage).toBeNull()
  })
})
