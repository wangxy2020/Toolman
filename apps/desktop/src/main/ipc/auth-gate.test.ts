import { describe, expect, it, vi } from 'vitest'

import { IpcChannel, ipcErr, ipcOk } from '@toolman/shared'

import { wrapHandlerWithAuthGate } from './auth-gate'

vi.mock('../services/auth-feature-gate.service', () => ({
  getAuthGateIpcError: vi.fn(),
}))

import { getAuthGateIpcError } from '../services/auth-feature-gate.service'

describe('wrapHandlerWithAuthGate', () => {
  it('passes through read community handlers', async () => {
    vi.mocked(getAuthGateIpcError).mockReturnValue(null)
    const handler = vi.fn(async () => ipcOk({ ok: true }))
    const wrapped = wrapHandlerWithAuthGate(IpcChannel.CommunityResourceList, handler)

    const result = await wrapped({ resourceType: 'mcp' })
    expect(handler).toHaveBeenCalledOnce()
    expect(result).toEqual(ipcOk({ ok: true }))
  })

  it('blocks gated handlers before execution', async () => {
    vi.mocked(getAuthGateIpcError).mockReturnValue(
      ipcErr({
        code: 'AUTH_REGISTRATION_REQUIRED',
        message: 'blocked',
        retryable: false,
      }),
    )
    const handler = vi.fn(async () => ipcOk({ ok: true }))
    const wrapped = wrapHandlerWithAuthGate(IpcChannel.CommunityInstall, handler)

    const result = await wrapped({ resourceId: 'x' })
    expect(handler).not.toHaveBeenCalled()
    expect(result).toEqual(
      ipcErr({
        code: 'AUTH_REGISTRATION_REQUIRED',
        message: 'blocked',
        retryable: false,
      }),
    )
  })

  it('blocks p2p workspace create for guests', async () => {
    vi.mocked(getAuthGateIpcError).mockReturnValue(
      ipcErr({
        code: 'AUTH_REGISTRATION_REQUIRED',
        message: 'group blocked',
        retryable: false,
      }),
    )
    const handler = vi.fn(async () => ipcOk({ workspace: { id: 'ws-1' } }))
    const wrapped = wrapHandlerWithAuthGate(IpcChannel.P2pWorkspaceCreate, handler)

    const result = await wrapped({ name: 'Test Group' })
    expect(handler).not.toHaveBeenCalled()
    expect(result.ok).toBe(false)
  })
})
