import { describe, expect, it } from 'vitest'
import { describeApiKey } from './settingsPaneUtils'
import { buildGroupSettingsSave, isGroupSettingsDirty } from './useGroupSettingsModal'
import { groupSharedPickerHint, sortGroupActivities } from './groupPagePanelUtils'

describe('settings and group helpers', () => {
  it('describes api keys without leaking the full secret', () => {
    expect(describeApiKey('')).toBe('未填写')
    expect(describeApiKey('sk-abcdefgh')).toContain('尾号 ****efgh')
  })

  it('validates group settings saves and dirty state', () => {
    const group = { id: '1', name: 'Alpha', description: 'd' } as never
    expect(isGroupSettingsDirty(group, 'Alpha', 'd')).toBe(false)
    expect(isGroupSettingsDirty(group, 'Beta', 'd')).toBe(true)
    expect(buildGroupSettingsSave('  ', '')).toEqual({ error: '群组名称不能为空' })
    expect(buildGroupSettingsSave(' Beta ', '  ')).toEqual({
      input: { name: 'Beta', description: undefined },
    })
  })

  it('sorts group activities and maps picker hints', () => {
    expect(groupSharedPickerHint('workflow')).toContain('工作流')
    expect(
      sortGroupActivities([
        { id: 'a', timestamp: 1, seq: 2 },
        { id: 'b', timestamp: 2, seq: 1 },
        { id: 'c', timestamp: 2, seq: 3 },
      ] as never).map((item) => item.id),
    ).toEqual(['c', 'b', 'a'])
  })
})
