import { describe, expect, it } from 'vitest'
import type { KnowledgeDocument } from '@toolman/shared'
import {
  formatKnowledgeIngestStatusBarMessage,
  truncateKnowledgeStatusFileName,
} from './knowledge-file-display'

const t = ((key: string, params?: Record<string, string | number>) => {
  if (key === 'knowledgePage.docStatus.parsing') return '解析中'
  if (key === 'knowledgePage.docStatus.embedding') return '嵌入中'
  if (key === 'knowledgePage.docStatus.queued') return '排队中'
  if (key === 'knowledgePage.ingestStatus.untitled') return '未命名文件'
  if (key === 'knowledgePage.ingestStatus.pages') {
    return `${params?.current}/${params?.total} 页`
  }
  if (key === 'knowledgePage.ingestStatus.chunks') {
    return `${params?.current}/${params?.total} 块`
  }
  if (key === 'knowledgePage.ingestStatus.withOthers') {
    return `${params?.message}（另有 ${params?.count} 个）`
  }
  return key
}) as never

function doc(partial: Partial<KnowledgeDocument> & Pick<KnowledgeDocument, 'id' | 'status'>): KnowledgeDocument {
  return {
    kbId: 'kb-1',
    title: '小说写作教程.pdf',
    contentHash: null,
    mimeType: 'application/pdf',
    absolutePath: null,
    sizeBytes: null,
    chunkCount: 0,
    errorMessage: null,
    createdAt: 1,
    updatedAt: 1,
    sourceKind: 'file',
    ...partial,
  }
}

describe('formatKnowledgeIngestStatusBarMessage', () => {
  it('truncates long file names', () => {
    expect(truncateKnowledgeStatusFileName('abcdefghijklmnop.pdf', 12)).toBe('abcdefg….pdf')
  })

  it('formats parsing with page detail early and as meta', () => {
    const formatted = formatKnowledgeIngestStatusBarMessage({
      items: [doc({ id: 'd1', status: 'parsing' })],
      progressById: { d1: 42 },
      detailById: { d1: { unit: 'page', current: 16, total: 289 } },
      t,
    })
    expect(formatted).toEqual({
      text: '解析中 · 16/289 页 · 42% · 小说写作教程.pdf',
      meta: '16/289 页',
    })
  })

  it('formats embedding with chunk detail and extra queue', () => {
    const formatted = formatKnowledgeIngestStatusBarMessage({
      items: [
        doc({ id: 'd1', status: 'embedding', title: 'a.pdf' }),
        doc({ id: 'd2', status: 'queued', title: 'b.pdf' }),
      ],
      progressById: { d1: 72 },
      detailById: { d1: { unit: 'chunk', current: 12, total: 40 } },
      t,
    })
    expect(formatted).toEqual({
      text: '嵌入中 · 12/40 块 · 72% · a.pdf（另有 1 个）',
      meta: '12/40 块',
    })
  })
})
