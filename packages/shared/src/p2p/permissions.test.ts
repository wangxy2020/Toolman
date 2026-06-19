import { describe, expect, it } from 'vitest'
import {
  canEditSharedResource,
  canManageSharedResource,
  canManageWorkspaceMembers,
  canWriteWorkspace,
  isReadonlyMember,
} from './permissions.js'

describe('p2p permissions', () => {
  it('treats readonly as non-writable', () => {
    expect(isReadonlyMember('readonly')).toBe(true)
    expect(canWriteWorkspace('readonly')).toBe(false)
    expect(canWriteWorkspace('member')).toBe(true)
  })

  it('allows admins to manage members', () => {
    expect(canManageWorkspaceMembers('owner')).toBe(true)
    expect(canManageWorkspaceMembers('admin')).toBe(true)
    expect(canManageWorkspaceMembers('member')).toBe(false)
  })

  it('checks shared resource management', () => {
    expect(canManageSharedResource('member', 'm1', 'm2')).toBe(false)
    expect(canManageSharedResource('member', 'm1', 'm1')).toBe(true)
    expect(canManageSharedResource('admin', 'm1', 'm2')).toBe(true)
    expect(
      canManageSharedResource('member', 'm1', 'm2', { uploadedBy: 'm1' }),
    ).toBe(true)
  })

  it('checks shared resource edit permission', () => {
    expect(
      canEditSharedResource('member', 'm1', { permission: 'write', sharedBy: 'm2' }),
    ).toBe(true)
    expect(
      canEditSharedResource('member', 'm1', { permission: 'read', sharedBy: 'm2' }),
    ).toBe(false)
    expect(
      canEditSharedResource('member', 'm1', { permission: 'read', sharedBy: 'm1' }),
    ).toBe(true)
    expect(
      canEditSharedResource('admin', 'm1', { permission: 'read', sharedBy: 'm2' }),
    ).toBe(true)
  })
})
