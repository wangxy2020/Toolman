import { describe, expect, it } from 'vitest'

import { CommunityTaskStatusSchema } from '@toolman/shared'

import { translate } from '../../i18n/translate'
import { formatTaskBudget, parseTaskTags, TASK_STATUS_LABELS } from './community-task-utils'

describe('community-task-utils', () => {
  it('formats task budget', () => {
    const t = (key: string) => translate('zh-CN', key)
    expect(formatTaskBudget(0, 'CNY', t)).toBe('面议')
    expect(formatTaskBudget(5000, 'CNY', t)).toBe('5,000 CNY')
  })

  it('parses task tags', () => {
    expect(parseTaskTags('rust, electron，mcp')).toEqual(['rust', 'electron', 'mcp'])
  })

  it('labels all task statuses', () => {
    const statuses = CommunityTaskStatusSchema.options
    for (const status of statuses) {
      expect(TASK_STATUS_LABELS[status]).toBeTruthy()
    }
    expect(Object.keys(TASK_STATUS_LABELS)).toHaveLength(statuses.length)
  })
})
