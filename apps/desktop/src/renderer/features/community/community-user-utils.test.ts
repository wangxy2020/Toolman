import { describe, expect, it } from 'vitest'

import {
  canDeleteCommunityComment,
  canDeleteCommunityResource,
  isCommunityFounder,
  isCommunityModerator,
} from './community-user-utils'

describe('community-user-utils', () => {
  it('identifies moderator and founder roles', () => {
    expect(isCommunityModerator('admin')).toBe(true)
    expect(isCommunityModerator('founder')).toBe(true)
    expect(isCommunityModerator('user')).toBe(false)
    expect(isCommunityFounder('founder')).toBe(true)
    expect(isCommunityFounder('admin')).toBe(false)
  })

  it('allows authors and moderators to delete comments', () => {
    expect(canDeleteCommunityComment('a1', null)).toBe(false)
    expect(canDeleteCommunityComment('a1', { id: 'a1', role: 'user' })).toBe(true)
    expect(canDeleteCommunityComment('a1', { id: 'other', role: 'user' })).toBe(false)
    expect(canDeleteCommunityComment('a1', { id: 'other', role: 'admin' })).toBe(true)
  })

  it('allows owners and moderators to delete resources', () => {
    expect(canDeleteCommunityResource('o1', { id: 'o1', role: 'user' })).toBe(true)
    expect(canDeleteCommunityResource('o1', { id: 'other', role: 'user' })).toBe(false)
    expect(canDeleteCommunityResource('o1', { id: 'other', role: 'founder' })).toBe(true)
  })
})
