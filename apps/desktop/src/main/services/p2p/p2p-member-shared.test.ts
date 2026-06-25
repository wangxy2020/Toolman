import { describe, expect, it, vi } from 'vitest'
import type { P2pWorkspaceMemberRow, P2pWorkspaceRow } from '@toolman/db'

vi.mock('../../bootstrap/database', () => ({
  getDatabase: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          get: () => ({ displayName: 'Owner User' }),
        }),
      }),
    }),
  }),
}))

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/toolman-member-shared-test' },
}))

vi.mock('./p2p-device-identity.service', () => ({
  getP2pDeviceInfo: () => ({ deviceId: 'dev-local', identityId: 'identity-local' }),
}))

vi.mock('./p2p-connection.service', () => ({
  getKnownP2pConnections: () => [{ peerDeviceId: 'dev-remote', state: 'connected' }],
  getPeerConnectionMode: () => 'lan' as const,
}))

vi.mock('./p2p-discovery.service', () => ({
  isP2pPeerDiscoverableOnline: () => false,
}))

vi.mock('@toolman/db', () => {
  class P2pMemberRepository {
    countActiveByWorkspace() {
      return 2
    }
  }

  class P2pPeerRepository {
    findByWorkspaceAndDevice() {
      return { lastSeenAt: new Date('2024-01-01T00:00:00.000Z') }
    }
  }

  return {
    P2pMemberRepository,
    P2pPeerRepository,
    P2pWorkspaceRepository: class {},
    P2pInviteRepository: class {},
    identities: {},
  }
})

import {
  mapMemberRow,
  mapWorkspaceRow,
  shouldInitiatePeerConnection,
  toWorkspaceDto,
} from './p2p-member-shared'

describe('p2p-member-shared', () => {
  const workspaceRow = {
    id: 'ws-1',
    name: 'Group',
    description: null,
    ownerDeviceId: 'dev-local',
    ownerIdentityId: 'identity-local',
    maxMembers: 10,
    status: 'active',
    lastEventSeq: 3,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-02T00:00:00.000Z'),
  } as P2pWorkspaceRow

  const memberRow = {
    id: 'member-1',
    workspaceId: 'ws-1',
    identityId: 'identity-remote',
    deviceId: 'dev-remote',
    displayName: 'Remote',
    role: 'member',
    status: 'active',
    lastSeenAt: new Date('2024-01-03T00:00:00.000Z'),
    joinedAt: new Date('2024-01-01T00:00:00.000Z'),
  } as P2pWorkspaceMemberRow

  it('maps workspace and member rows', () => {
    expect(mapWorkspaceRow(workspaceRow, 2).memberCount).toBe(2)
    expect(toWorkspaceDto(workspaceRow).name).toBe('Group')

    const member = mapMemberRow(memberRow, 'ws-1')
    expect(member.online).toBe(true)
    expect(member.connectionMode).toBe('lan')
  })

  it('chooses deterministic peer connection initiator', () => {
    expect(shouldInitiatePeerConnection('aaa', 'bbb')).toBe(true)
    expect(shouldInitiatePeerConnection('bbb', 'aaa')).toBe(false)
  })
})
