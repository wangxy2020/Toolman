import { describe, expect, it } from 'vitest'
import { canRemoveKnowledgeStoragePath } from './knowledge-kb-storage-path.service'

describe('account isolation path guards', () => {
  it('allows deleting a KB subfolder under the kind root', () => {
    expect(
      canRemoveKnowledgeStoragePath(
        '/tmp/ToolmanData/acct/同步知识库/课本',
        '/tmp/ToolmanData/acct/同步知识库',
      ),
    ).toBe(true)
  })

  it('never allows deleting the kind root itself', () => {
    expect(
      canRemoveKnowledgeStoragePath(
        '/tmp/ToolmanData/acct/同步知识库',
        '/tmp/ToolmanData/acct/同步知识库',
      ),
    ).toBe(false)
  })

  it('rejects paths outside the active account kind root', () => {
    expect(
      canRemoveKnowledgeStoragePath(
        '/tmp/other/课本',
        '/tmp/ToolmanData/acct/同步知识库',
      ),
    ).toBe(false)
  })
})
