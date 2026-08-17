import { describe, expect, it } from 'vitest'
import {
  classroomKbDisplayName,
  classroomKbDocumentSummary,
  classroomKbTitlesFromSnapshot,
  formatClassroomKbSelectionLabel,
  resolveBoundClassroomKbLabel,
} from './classroomKbDisplay'

describe('classroomKbDisplay', () => {
  it('labels the sync default folder instead of showing a raw kind or id', () => {
    expect(
      classroomKbDisplayName({
        name: '默认文件夹',
        kind: 'sync',
      }),
    ).toBe('同步知识库 · 默认文件夹')
    expect(
      classroomKbDisplayName({
        name: 'a1b2c3d4-e5f6-4111-8222-abcdef123456',
        kind: 'local',
      }),
    ).toBe('本地知识库')
    expect(classroomKbDisplayName({ name: '高中物理', kind: 'local' })).toBe('高中物理')
    expect(
      classroomKbDisplayName({
        name: 'a1b2c3d4e5f67890abcdef12',
        kind: 'sync',
      }),
    ).toBe('同步知识库')
  })

  it('prefers remembered labels and snapshot file names over opaque ids', () => {
    expect(
      resolveBoundClassroomKbLabel({
        id: 'a1b2c3d4-e5f6-4111-8222-abcdef123456',
        item: { id: 'kb-1', name: 'a1b2c3d4-e5f6-4111-8222-abcdef123456', kind: 'sync' },
        remembered: '同步知识库 · 默认文件夹（力学第一章.pdf）',
      }),
    ).toBe('同步知识库 · 默认文件夹（力学第一章.pdf）')
    expect(
      classroomKbTitlesFromSnapshot('kb-1', {
        documents: [{ id: 'd1', kbId: 'kb-1', title: 'aaaaaaaaaaaaaaaa' }],
        files: [{ documentId: 'd1', kbId: 'kb-1', fileName: '力学第一章.pdf' }],
      }),
    ).toEqual(['力学第一章.pdf'])
  })

  it('prefers document file names over a kind + count subtitle', () => {
    expect(
      classroomKbDocumentSummary({
        id: 'kb-1',
        name: '默认文件夹',
        kind: 'sync',
        documentCount: 1,
        documentTitles: ['力学第一章.pdf'],
      }),
    ).toBe('力学第一章.pdf')
    expect(
      formatClassroomKbSelectionLabel({
        id: 'kb-1',
        name: '默认文件夹',
        kind: 'sync',
        documentCount: 1,
        documentTitles: ['力学第一章.pdf'],
      }),
    ).toBe('同步知识库 · 默认文件夹（力学第一章.pdf）')
  })
})
