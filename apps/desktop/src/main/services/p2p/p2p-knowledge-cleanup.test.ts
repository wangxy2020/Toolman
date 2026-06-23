import { describe, expect, it } from 'vitest'
import { isP2pGroupSavedKnowledgeDescription } from '@toolman/shared'

describe('cleanupMisplacedP2pMirrorKnowledgeBases', () => {
  it('does not treat group saved knowledge metadata as polluted', () => {
    const description = JSON.stringify({
      groupSavedKnowledge: {
        groupName: '测试群',
        sharedFolderName: '资料库',
        p2pWorkspaceId: 'ws-1',
      },
    })
    expect(isP2pGroupSavedKnowledgeDescription(description)).toBe(true)
  })
})
