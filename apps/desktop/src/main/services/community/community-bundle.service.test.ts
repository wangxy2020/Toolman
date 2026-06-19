import { describe, expect, it } from 'vitest'

import { resolveBundleAwareLocalRef } from './community-bundle.service'

describe('community-bundle.service', () => {
  it('prefers primary local ref over bundle refs', () => {
    const localRef = resolveBundleAwareLocalRef('community-mcp', {
      agentPackage: {
        assistantId: 'assistant-1',
        workspaceId: 'workspace-1',
      },
    })
    expect(localRef).toBe('community-mcp')
  })

  it('falls back to bundle refs when primary install is absent', () => {
    expect(
      resolveBundleAwareLocalRef(null, {
        agentPackage: {
          assistantId: 'assistant-1',
          workspaceId: 'workspace-1',
        },
      }),
    ).toBe('assistant-1')

    expect(
      resolveBundleAwareLocalRef(null, {
        knowledgeBundle: {
          kbId: 'kb-1',
          workspaceId: 'workspace-1',
          ingested: 1,
          skipped: 0,
          failed: [],
        },
      }),
    ).toBe('kb-1')
  })
})
