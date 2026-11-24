import { describe, expect, it } from 'vitest'
import type { KnowledgeBase } from '@toolman/shared'
import { buildClassroomKbPickerGroups } from './assistant-lib-kb-picker-groups'

function kb(
  partial: Partial<KnowledgeBase> & Pick<KnowledgeBase, 'id' | 'name' | 'kind'>,
): KnowledgeBase {
  return {
    workspaceId: 'ws-1',
    description: null,
    documentCount: 2,
    chunkCount: 4,
    chunkConfig: { strategy: 'fixed', chunkSize: 512, chunkOverlap: 64 },
    embedConfig: {},
    watchConfig: {},
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  } as KnowledgeBase
}

const t = ((key: string) => key) as never

describe('buildClassroomKbPickerGroups', () => {
  it('nests knowledge bases under sidebar sections', () => {
    const groups = buildClassroomKbPickerGroups({
      knowledgeBases: [
        kb({ id: 'proj', name: '项目资料', kind: 'local' }),
        kb({ id: 'local-default', name: '默认文件夹', kind: 'local' }),
        kb({ id: 'net', name: '官网', kind: 'network' }),
        kb({ id: 'files', name: '默认文件夹', kind: 'local_files' }),
      ],
      loadedDocs: {},
      docCountLabel: (count) => `${count} docs`,
      sectionCountLabel: (count) => `${count} kbs`,
      t,
    })

    expect(groups.map((group) => ({ id: group.id, sectionHeader: Boolean(group.sectionHeader), depth: group.depth }))).toEqual([
      { id: 'section:local', sectionHeader: true, depth: 0 },
      { id: 'local-default', sectionHeader: false, depth: 1 },
      { id: 'proj', sectionHeader: false, depth: 1 },
      { id: 'section:network', sectionHeader: true, depth: 0 },
      { id: 'net', sectionHeader: false, depth: 1 },
    ])
    expect(groups.find((group) => group.id === 'local-default')?.name).not.toContain('·')
  })
})
