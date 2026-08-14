import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SYNC_FOLDER_ID,
  KNOWLEDGE_SIDEBAR_SECTIONS,
  isSystemDefaultFolderName,
  listedSyncKnowledgeItems,
  mobileSyncKbUiId,
  knowledgeBasesForSection,
} from './knowledgeSidebar'

describe('KNOWLEDGE_SIDEBAR_SECTIONS', () => {
  it('puts 同步知识库 first', () => {
    expect(KNOWLEDGE_SIDEBAR_SECTIONS.map((section) => section.id)).toEqual([
      'sync',
      'local',
      'network',
      'shared',
    ])
  })
})

describe('listedSyncKnowledgeItems', () => {
  it('hides the desktop 默认文件夹 so the virtual row is the only one', () => {
    const listed = listedSyncKnowledgeItems([
      { id: 'real-default', name: '默认文件夹' },
      { id: 'custom', name: '产品手册' },
    ])
    expect(listed.map((item) => item.id)).toEqual(['custom'])
  })

  it('maps the desktop default folder onto the virtual sync folder id', () => {
    expect(isSystemDefaultFolderName('默认文件夹')).toBe(true)
    expect(mobileSyncKbUiId({ id: 'uuid-1', name: '默认文件夹' })).toBe(DEFAULT_SYNC_FOLDER_ID)
    expect(mobileSyncKbUiId({ id: 'uuid-2', name: '产品手册' })).toBe('uuid-2')
  })
})

describe('knowledgeBasesForSection', () => {
  it('lists created local/network KBs under their own section', () => {
    const created = [
      { id: 'l1', name: '产品文档', kind: 'local' },
      { id: 'n1', name: '官网', kind: 'network' },
    ]
    expect(knowledgeBasesForSection('local', created, []).map((kb) => kb.id)).toEqual(['l1'])
    expect(knowledgeBasesForSection('network', created, []).map((kb) => kb.id)).toEqual(['n1'])
    expect(knowledgeBasesForSection('shared', created, [])).toEqual([])
  })

  it('puts created sync KBs ahead of desktop-synced ones without duplicates', () => {
    const created = [{ id: 's1', name: '现场资料', kind: 'sync' }]
    const synced = [
      { id: 's1', name: '现场资料' },
      { id: 'desk', name: '桌面同步库' },
    ]
    expect(knowledgeBasesForSection('sync', created, synced).map((kb) => kb.id)).toEqual([
      's1',
      'desk',
    ])
  })
})
