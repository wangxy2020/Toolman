import { describe, expect, it } from 'vitest'

import { formatTaskBudget, parseTaskTags, TASK_STATUS_LABELS } from './community-task-utils'

describe('community-task-utils', () => {
  it('formats task budget', () => {
    expect(formatTaskBudget(0, 'CNY')).toBe('面议')
    expect(formatTaskBudget(5000, 'CNY')).toBe('5,000 CNY')
  })

  it('parses task tags', () => {
    expect(parseTaskTags('rust, electron，mcp')).toEqual(['rust', 'electron', 'mcp'])
  })

  it('labels all task statuses', () => {
    expect(Object.keys(TASK_STATUS_LABELS)).toHaveLength(8)
  })
})
