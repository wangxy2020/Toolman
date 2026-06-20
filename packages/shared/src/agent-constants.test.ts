import { describe, expect, it } from 'vitest'

import { resolveMcpServerIdsForSkills } from './agent-constants'

describe('resolveMcpServerIdsForSkills', () => {
  it('leaves mcp list unchanged when no skill defaults apply', () => {
    const result = resolveMcpServerIdsForSkills(['find-skills'], ['filesystem'])
    expect(result).toEqual(['filesystem'])
  })
})
