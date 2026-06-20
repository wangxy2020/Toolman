import { describe, expect, it } from 'vitest'
import {
  buildChatWithKnowledgeFilesDraft,
  isChatAttachableKnowledgeFile,
  resolveKnowledgeFilesForChat,
} from './knowledge-chat-files'

describe('resolveKnowledgeFilesForChat', () => {
  const items = [
    {
      id: '1',
      title: 'a.docx',
      createdAt: 1,
      updatedAt: 1,
      absolutePath: '/tmp/a.docx',
    },
    {
      id: '2',
      title: 'web.html',
      createdAt: 2,
      updatedAt: 2,
      absolutePath: 'https://example.com/page',
    },
  ]

  it('prefers selected local files', () => {
    expect(resolveKnowledgeFilesForChat(items, new Set(['1', '2']))).toEqual([items[0]])
  })

  it('falls back to all attachable files when nothing selected', () => {
    expect(resolveKnowledgeFilesForChat(items, new Set())).toEqual([items[0]])
  })
})

describe('isChatAttachableKnowledgeFile', () => {
  it('rejects url-only documents', () => {
    expect(
      isChatAttachableKnowledgeFile({
        id: '1',
        title: 'x',
        createdAt: 0,
        updatedAt: 0,
        absolutePath: 'https://example.com',
      }),
    ).toBe(false)
  })
})

describe('buildChatWithKnowledgeFilesDraft', () => {
  it('builds single and multi file prompts', () => {
    expect(buildChatWithKnowledgeFilesDraft(['notes.docx'])).toContain('notes.docx')
    expect(buildChatWithKnowledgeFilesDraft(['a', 'b'])).toContain('2 个附件')
  })
})
