import { describe, expect, it } from 'vitest'

import {
  formatCommunityCount,
  parseMcpManifestPreview,
  parseSkillManifestPreview,
  parseWorkflowManifestPreview,
} from './community-market-utils'

describe('community-market-utils', () => {
  it('formats large counts', () => {
    expect(formatCommunityCount(1200)).toBe('1200')
    expect(formatCommunityCount(12_500)).toBe('1.3万')
  })

  it('parses mcp manifest preview', () => {
    const preview = parseMcpManifestPreview({
      mcpId: 'demo-server',
      transport: 'stdio',
      command: 'npx',
      tools: [{ name: 'search', description: 'Search the web' }],
    })

    expect(preview).toEqual({
      mcpId: 'demo-server',
      transport: 'stdio',
      command: 'npx',
      tools: [{ name: 'search', description: 'Search the web' }],
    })
  })

  it('parses skill manifest preview', () => {
    const preview = parseSkillManifestPreview({
      skillId: 'code-review',
      name: 'Code Review',
      description: 'Review pull requests',
      includesPrompt: true,
      files: ['SKILL.md', 'prompts/review.md'],
    })

    expect(preview).toEqual({
      skillId: 'code-review',
      name: 'Code Review',
      description: 'Review pull requests',
      includesPrompt: true,
      files: ['SKILL.md', 'prompts/review.md'],
    })
  })

  it('parses workflow manifest preview', () => {
    const preview = parseWorkflowManifestPreview({
      workflowId: 'daily-report',
      engine: 'langgraph',
      graphPath: 'graph.json',
      requiredMcpIds: ['filesystem'],
      requiredSkillIds: ['summarize'],
      graph: { nodes: [{ id: 'start' }, { id: 'end' }] },
    })

    expect(preview).toEqual({
      workflowId: 'daily-report',
      engine: 'langgraph',
      graphPath: 'graph.json',
      requiredMcpIds: ['filesystem'],
      requiredSkillIds: ['summarize'],
      nodeCount: 2,
    })
  })
})
