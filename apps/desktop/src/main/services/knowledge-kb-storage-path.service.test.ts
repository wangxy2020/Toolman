import { describe, expect, it } from 'vitest'
import { normalizeP2pGroupSavedKnowledgeMeta } from '@toolman/shared'
import {
  canRemoveKnowledgeStoragePath,
  resolveGroupSavedKnowledgeStorageDir,
} from './knowledge-kb-storage-path.service'

describe('resolveGroupSavedKnowledgeStorageDir', () => {
  it('uses group name only and ignores shared folder segment', () => {
    const meta = normalizeP2pGroupSavedKnowledgeMeta('测试 A', '默认文件夹', 'ws-1')
    expect(resolveGroupSavedKnowledgeStorageDir(meta)).toBe('测试 A')
  })
})

describe('canRemoveKnowledgeStoragePath', () => {
  it('allows deleting a KB subfolder under the kind root', () => {
    expect(
      canRemoveKnowledgeStoragePath('/tmp/ToolmanData/同步知识库/高中化学必修1', '/tmp/ToolmanData/同步知识库'),
    ).toBe(true)
  })

  it('never allows deleting the kind root itself', () => {
    expect(canRemoveKnowledgeStoragePath('/tmp/ToolmanData/同步知识库', '/tmp/ToolmanData/同步知识库')).toBe(
      false,
    )
  })

  it('rejects paths outside the kind root', () => {
    expect(
      canRemoveKnowledgeStoragePath('/tmp/other/高中化学必修1', '/tmp/ToolmanData/同步知识库'),
    ).toBe(false)
  })
})
