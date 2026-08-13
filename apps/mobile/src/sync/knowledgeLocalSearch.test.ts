import { describe, expect, it } from 'vitest'
import type { KnowledgeSnapshot } from '@toolman/shared'
import { searchKnowledgeSnapshot } from './knowledgeLocalSearch'

const snapshot: KnowledgeSnapshot = {
  schemaVersion: 1,
  exportedAt: 1,
  kbs: [{ id: 'kb1', name: '产品手册', kind: 'sync', documentCount: 1, updatedAt: 1 }],
  documents: [
    {
      id: 'd1',
      kbId: 'kb1',
      title: '安装说明',
      status: 'ready',
      sourceKind: 'file',
      chunkCount: 1,
      updatedAt: 1,
    },
  ],
  chunks: [
    {
      id: 'c1',
      documentId: 'd1',
      kbId: 'kb1',
      chunkIndex: 0,
      text: '先连接电源，再打开设备开关。',
    },
  ],
  vectors: [],
  files: [],
}

describe('searchKnowledgeSnapshot', () => {
  it('ranks chunks that contain the query terms', () => {
    const hits = searchKnowledgeSnapshot(snapshot, '电源')
    expect(hits).toHaveLength(1)
    expect(hits[0]?.documentTitle).toBe('安装说明')
    expect(hits[0]?.kbName).toBe('产品手册')
  })

  it('returns nothing when no term matches', () => {
    expect(searchKnowledgeSnapshot(snapshot, '不存在的词')).toEqual([])
  })
})
