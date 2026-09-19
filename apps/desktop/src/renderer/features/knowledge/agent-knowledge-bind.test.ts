import { describe, expect, it } from 'vitest'
import type { KnowledgeBase } from '@toolman/shared'
import {
  filterAgentBindableKnowledgeBases,
  groupAgentBindableKnowledgeBases,
} from './agent-knowledge-bind'

function kb(partial: Partial<KnowledgeBase> & Pick<KnowledgeBase, 'id' | 'name' | 'kind'>): KnowledgeBase {
  return {
    workspaceId: 'ws-1',
    description: null,
    documentCount: 1,
    chunkCount: 3,
    chunkConfig: { strategy: 'fixed', chunkSize: 512, chunkOverlap: 64 },
    embedConfig: {},
    watchConfig: {},
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  } as KnowledgeBase
}

describe('filterAgentBindableKnowledgeBases', () => {
  it('includes default-folder local and network KBs', () => {
    const items = [
      kb({ id: '1', name: '默认文件夹', kind: 'local' }),
      kb({ id: '2', name: '默认文件夹', kind: 'network' }),
      kb({ id: '3', name: '我的资料', kind: 'local' }),
    ]
    expect(filterAgentBindableKnowledgeBases(items).map((item) => item.id)).toEqual(['1', '2', '3'])
  })

  it('excludes local_files storage-only KBs', () => {
    const items = [
      kb({ id: '1', name: '默认文件夹', kind: 'local_files' }),
      kb({ id: '2', name: '默认文件夹', kind: 'local' }),
    ]
    expect(filterAgentBindableKnowledgeBases(items).map((item) => item.id)).toEqual(['2'])
  })
})

describe('groupAgentBindableKnowledgeBases', () => {
  it('keeps first-level sections in sidebar order and nests default folders first', () => {
    const items = [
      kb({ id: 'proj', name: '项目资料', kind: 'local' }),
      kb({ id: 'local-default', name: '默认文件夹', kind: 'local' }),
      kb({ id: 'net', name: '官网', kind: 'network' }),
      kb({ id: 'sync', name: '默认同步', kind: 'sync' }),
      kb({ id: 'shared', name: '[设计组] 规范', kind: 'shared' }),
      kb({ id: 'files', name: '默认文件夹', kind: 'local_files' }),
    ]

    const groups = groupAgentBindableKnowledgeBases(items)
    expect(groups.map((group) => group.id)).toEqual(['local', 'sync', 'network', 'shared'])
    expect(groups[0]?.items.map((item) => item.id)).toEqual(['local-default', 'proj'])
    expect(groups[1]?.items.map((item) => item.id)).toEqual(['sync'])
    expect(groups[2]?.items.map((item) => item.id)).toEqual(['net'])
    expect(groups[3]?.items.map((item) => item.id)).toEqual(['shared'])
  })
})
