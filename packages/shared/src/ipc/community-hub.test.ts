import { describe, expect, it } from 'vitest'
import { CommunityHubIdentityIdSchema, CommunityUserProfileSchema } from './community-hub.js'

function profile(identityId: string) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    identityId,
    displayName: 'wxymale',
    role: 'user',
    canPublish: true,
    canAcceptTask: true,
    canCreateResource: true,
    isBanned: false,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
  }
}

describe('CommunityHubIdentityIdSchema', () => {
  it('accepts guest UUID and Authing/Firebase linked ids', () => {
    expect(CommunityHubIdentityIdSchema.parse('00000000-0000-0000-0000-000000000001')).toBe(
      '00000000-0000-0000-0000-000000000001',
    )
    expect(CommunityHubIdentityIdSchema.parse('ag-abcdef0123456789abcdef01')).toBe(
      'ag-abcdef0123456789abcdef01',
    )
    expect(CommunityHubIdentityIdSchema.parse('fb-uid-from-google')).toBe('fb-uid-from-google')
  })

  it('parses a community profile whose identityId is not a UUID', () => {
    expect(CommunityUserProfileSchema.parse(profile('ag-abcdef0123456789abcdef01')).identityId).toBe(
      'ag-abcdef0123456789abcdef01',
    )
  })
})
