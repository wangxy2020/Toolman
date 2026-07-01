import { describe, expect, it } from 'vitest'

import {
  buildProjectManagementSessionMetadata,
  parseProjectManagementSessionMetadata,
} from './agent-link.js'
import { buildProjectManagementRuntimeHint } from './epc-context.js'

describe('project management agent link metadata', () => {
  it('round-trips session metadata', () => {
    const metadata = buildProjectManagementSessionMetadata('cost_management')
    const parsed = parseProjectManagementSessionMetadata(metadata)
    expect(parsed).toEqual({ tab: 'cost_management', dataSource: 'mock' })
  })
})

describe('buildProjectManagementRuntimeHint', () => {
  it('includes portfolio summary for cost tab', () => {
    const hint = buildProjectManagementRuntimeHint('cost_management')
    expect(hint).toContain('成本管理')
    expect(hint).toContain('EPC-2401')
    expect(hint).toContain('合同总额')
  })

  it('includes progress fields for schedule tab', () => {
    const hint = buildProjectManagementRuntimeHint('progress_management')
    expect(hint).toContain('计划管理')
    expect(hint).toContain('进度')
  })
})
