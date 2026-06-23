import { describe, expect, it } from 'vitest'

import {
  buildSharedKnowledgeDocMetaFromEvents,
  mergeSharedKnowledgePanelDocuments,
} from './group-shared-knowledge-documents'

describe('buildSharedKnowledgeDocMetaFromEvents', () => {
  it('collects document ids from Shared and Updated events', () => {
    const meta = buildSharedKnowledgeDocMetaFromEvents(
      [
        {
          eventType: 'Shared',
          timestamp: 100,
          payload: {
            kb_id: 'kb-1',
            document_ids: ['doc-a'],
          },
        },
        {
          eventType: 'Updated',
          timestamp: 200,
          payload: {
            kb_id: 'kb-1',
            doc_id: 'doc-b',
            title: '报告.pdf',
            size_bytes: 1024,
            mime_type: 'application/pdf',
            content_hash: 'abc123hash',
          },
        },
      ],
      'kb-1',
    )

    expect(meta.get('doc-a')?.title).toBe('共享文档')
    expect(meta.get('doc-b')?.title).toBe('报告.pdf')
    expect(meta.get('doc-b')?.sizeBytes).toBe(1024)
  })
})

describe('mergeSharedKnowledgePanelDocuments', () => {
  it('shows remote-only documents before local sync completes', () => {
    const merged = mergeSharedKnowledgePanelDocuments(
      [],
      undefined,
      new Map([
        [
          'doc-b',
          {
            id: 'doc-b',
            title: '报告.pdf',
            updatedAt: 200,
            mimeType: 'application/pdf',
          },
        ],
      ]),
    )

    expect(merged).toHaveLength(1)
    expect(merged[0]?.title).toBe('报告.pdf')
    expect(merged[0]?.status).toBe('pending')
  })

  it('prefers local items when already synced', () => {
    const merged = mergeSharedKnowledgePanelDocuments(
      [
        {
          id: 'doc-b',
          title: '报告.pdf',
          createdAt: 200,
          updatedAt: 200,
          status: 'ready',
          absolutePath: '/tmp/report.pdf',
          sourceKind: 'file',
        },
      ],
      undefined,
      new Map([
        [
          'doc-b',
          {
            id: 'doc-b',
            title: '旧标题',
            updatedAt: 100,
          },
        ],
      ]),
    )

    expect(merged[0]?.status).toBe('ready')
    expect(merged[0]?.absolutePath).toBe('/tmp/report.pdf')
  })
})
