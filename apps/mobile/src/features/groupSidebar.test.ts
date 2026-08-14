import { describe, expect, it } from 'vitest'
import {
  DEFAULT_GROUP_ACTION,
  GROUP_SIDEBAR_ACTIONS,
  GROUP_SIDEBAR_MENUS,
  getGroupSidebarMenu,
} from './groupSidebar'

describe('GROUP_SIDEBAR_MENUS', () => {
  it('matches desktop group header action order', () => {
    expect(GROUP_SIDEBAR_ACTIONS).toEqual([
      'members',
      'messages',
      'agents',
      'knowledge',
      'notes',
      'workflow',
      'activity',
    ])
    expect(GROUP_SIDEBAR_MENUS.map((menu) => menu.id)).toEqual([...GROUP_SIDEBAR_ACTIONS])
  })

  it('defaults to 群组消息', () => {
    expect(DEFAULT_GROUP_ACTION).toBe('messages')
    expect(getGroupSidebarMenu('messages').label).toBe('群组消息')
  })
})
