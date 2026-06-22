import { describe, expect, it, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  localDeviceId: 'device-member',
  ownerDeviceId: 'device-owner',
  workspace: {
    id: 'ws-1',
    ownerDeviceId: 'device-owner',
    ownerIdentityId: 'identity-owner',
    name: 'Test Group',
    description: null,
    maxMembers: 10,
    workspaceKeyHash: 'hash',
    lastSnapshotSeq: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  ownerMember: {
    id: 'member-owner',
    workspaceId: 'ws-1',
    identityId: 'identity-owner',
    deviceId: 'device-owner',
    displayName: 'Owner',
    role: 'owner' as const,
    status: 'active' as const,
    joinedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  sharerMember: {
    id: 'member-sharer',
    workspaceId: 'ws-1',
    identityId: 'identity-sharer',
    deviceId: 'device-member',
    displayName: 'Member',
    role: 'member' as const,
    status: 'active' as const,
    joinedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
}))

vi.mock('./p2p-device-identity.service', () => ({
  getP2pDeviceInfo: () => ({ deviceId: mocks.localDeviceId, identityId: 'identity-member' }),
}))

vi.mock('./p2p-member.service', () => ({
  ensureOwnerMemberRecord: vi.fn(),
}))

vi.mock('../../bootstrap/database', () => ({
  getDatabase: () => ({}),
}))

vi.mock('@toolman/db', () => {
  class P2pMemberRepository {
    findById(id: string) {
      if (id === mocks.ownerMember.id) return mocks.ownerMember
      if (id === mocks.sharerMember.id) return mocks.sharerMember
      return null
    }

    findByWorkspaceAndDevice() {
      return null
    }

    listByWorkspace() {
      return [mocks.ownerMember]
    }
  }

  class P2pWorkspaceRepository {
    findById(id: string) {
      return id === mocks.workspace.id ? mocks.workspace : null
    }
  }

  class P2pSharedResourceRepository {
    findById() {
      return null
    }
  }

  return {
    P2pMemberRepository,
    P2pWorkspaceRepository,
    P2pSharedResourceRepository,
    assistants: {},
    blocksToText: () => '',
    createMessageRepository: vi.fn(),
    createSessionRepository: vi.fn(),
    runInTransaction: (_db: unknown, fn: (tx: unknown) => unknown) => fn({}),
  }
})

vi.mock('../../db/repos', () => ({
  getSessionRepository: () => ({
    listRows: () => [],
    findRowById: () => null,
    update: vi.fn(),
  }),
}))

vi.mock('../assistant.service', () => ({
  createAssistant: vi.fn(),
  getAssistantRow: vi.fn(),
  listAssistants: vi.fn(() => []),
  restoreAssistantIfDeleted: vi.fn(),
  updateAssistant: vi.fn(),
}))

vi.mock('../session.service', () => ({
  clearSessionMessages: vi.fn(),
  createSession: vi.fn(),
}))

vi.mock('../workspace.service', () => ({
  getDefaultWorkspace: vi.fn(),
}))

vi.mock('./agent-share.service', () => ({
  normalizeAssistantModelId: (value: string) => value,
  readAgentShareMetadata: () => ({}),
  readSharedAgentModelId: () => null,
}))

vi.mock('./p2p-group-resource-naming', () => ({
  buildGroupVirtualAgentName: () => 'proxy-assistant',
}))

vi.mock('./p2p-agent-relay.service', () => ({
  fetchRemoteSessionHistory: vi.fn(),
}))

vi.mock('./p2p-permission.guard', () => ({
  assertWorkspaceMemberAccess: vi.fn(),
}))

import {
  normalizeP2pGroupAgentProxyOwnerDevice,
  readP2pGroupAgentFromSessionRow,
} from './p2p-group-agent-proxy.service'

describe('p2p-group-agent-proxy owner resolution', () => {
  beforeEach(() => {
    mocks.localDeviceId = 'device-member'
  })

  it('repairs stale local ownerDeviceId using workspace owner', () => {
    const repaired = normalizeP2pGroupAgentProxyOwnerDevice({
      p2pWorkspaceId: '550e8400-e29b-41d4-a716-446655440000',
      resourceId: 'resource-1',
      sourceAssistantId: 'assistant-1',
      sourceSessionId: '660e8400-e29b-41d4-a716-446655440001',
      ownerMemberId: mocks.ownerMember.id,
      ownerDeviceId: mocks.localDeviceId,
      permission: 'callable',
      groupName: 'Group',
      sharedAgentName: 'Agent',
      referencedModelId: 'openai/gpt-4o-mini',
    })

    expect(repaired.ownerDeviceId).toBe(mocks.ownerDeviceId)
  })

  it('reads session metadata and normalizes owner device id', () => {
    const metadataJson = JSON.stringify({
      p2pGroupAgent: {
        p2pWorkspaceId: '550e8400-e29b-41d4-a716-446655440000',
        resourceId: 'resource-1',
        sourceAssistantId: 'assistant-1',
        sourceSessionId: '660e8400-e29b-41d4-a716-446655440001',
        ownerMemberId: mocks.ownerMember.id,
        ownerDeviceId: mocks.localDeviceId,
        permission: 'callable',
        groupName: 'Group',
        sharedAgentName: 'Agent',
        referencedModelId: 'openai/gpt-4o-mini',
      },
    })

    mocks.workspace.id = '550e8400-e29b-41d4-a716-446655440000'
    mocks.ownerMember.workspaceId = '550e8400-e29b-41d4-a716-446655440000'

    const proxy = readP2pGroupAgentFromSessionRow(metadataJson)
    expect(proxy?.ownerDeviceId).toBe(mocks.ownerDeviceId)
  })
})
