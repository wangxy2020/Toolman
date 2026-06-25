import { describe, expect, it, vi } from 'vitest'

vi.mock('../../bootstrap/database', () => ({
  getDatabase: () => ({}),
}))

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/toolman-workspace-test' },
}))

vi.mock('./p2p-device-identity.service', () => ({
  getP2pDeviceInfo: () => ({ deviceId: 'dev-owner', identityId: 'identity-owner' }),
}))

vi.mock('./p2p-auth.guard', () => ({
  assertRegisteredForP2p: vi.fn(),
}))

vi.mock('./p2p-workspace-vip-pool.service', () => ({
  refreshOwnedWorkspaceVipPools: vi.fn(),
  maybeActivateWorkspaceVipPool: vi.fn(),
}))

vi.mock('@toolman/db', () => {
  const workspaceRow = {
    id: 'ws-1',
    name: 'Test Group',
    description: null,
    ownerDeviceId: 'dev-owner',
    ownerIdentityId: 'identity-owner',
    maxMembers: 10,
    workspaceKeyHash: 'hash',
    settingsJson: null,
    status: 'active',
    lastEventSeq: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  class P2pWorkspaceRepository {
    listAll() {
      return [workspaceRow]
    }

    listByOwnerDevice(deviceId: string) {
      return deviceId === 'dev-owner' ? [workspaceRow] : []
    }

    findById(id: string) {
      return id === workspaceRow.id ? workspaceRow : null
    }
  }

  class P2pMemberRepository {
    countActiveByWorkspace() {
      return 1
    }

    listActiveMembershipsByDevice(deviceId: string) {
      return deviceId === 'dev-owner'
        ? [{ workspaceId: 'ws-1', status: 'active' }]
        : []
    }

    findByWorkspaceAndDevice(workspaceId: string, deviceId: string) {
      if (workspaceId === 'ws-1' && deviceId === 'dev-owner') {
        return { status: 'active' }
      }
      return null
    }
  }

  return {
    P2pWorkspaceRepository,
    P2pMemberRepository,
    hashWorkspaceKey: vi.fn(),
    identities: {},
  }
})

import { getP2pWorkspace, getP2pWorkspaceStoragePath, listP2pWorkspaces } from './p2p-workspace.service'

describe('p2p-workspace.service', () => {
  it('lists and gets workspaces', () => {
    const workspaces = listP2pWorkspaces('all')
    expect(workspaces).toHaveLength(1)
    expect(workspaces[0]?.name).toBe('Test Group')
    expect(getP2pWorkspace('ws-1').id).toBe('ws-1')
  })

  it('builds storage path under userData', () => {
    expect(getP2pWorkspaceStoragePath('ws-1')).toContain('ws-1')
  })
})
