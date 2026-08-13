import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SYNC_FOLDER_ID,
  KNOWLEDGE_SIDEBAR_SECTIONS,
  isSystemDefaultFolderName,
  listedSyncKnowledgeItems,
  mobileSyncKbUiId,
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
