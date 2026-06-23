import { describe, expect, it } from 'vitest'
import {
  isWorkspaceVipPoolEnabled,
  mergeP2pWorkspaceSettings,
  parseP2pWorkspaceSettings,
} from './workspace-settings'

describe('parseP2pWorkspaceSettings', () => {
  it('returns empty object for missing json', () => {
    expect(parseP2pWorkspaceSettings(null)).toEqual({})
    expect(parseP2pWorkspaceSettings('')).toEqual({})
  })

  it('parses vipPoolEnabled flag', () => {
    expect(parseP2pWorkspaceSettings(JSON.stringify({ vipPoolEnabled: true }))).toEqual({
      vipPoolEnabled: true,
    })
  })
})

describe('mergeP2pWorkspaceSettings', () => {
  it('merges vip pool flag into existing settings', () => {
    const merged = mergeP2pWorkspaceSettings(JSON.stringify({ foo: 1 }), {
      vipPoolEnabled: true,
    })
    expect(JSON.parse(merged)).toEqual({ foo: 1, vipPoolEnabled: true })
  })
})

describe('isWorkspaceVipPoolEnabled', () => {
  it('detects enabled vip pool', () => {
    expect(isWorkspaceVipPoolEnabled(JSON.stringify({ vipPoolEnabled: true }))).toBe(true)
    expect(isWorkspaceVipPoolEnabled(JSON.stringify({ vipPoolEnabled: false }))).toBe(false)
  })
})
