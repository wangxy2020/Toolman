import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/toolman-mobile-sync-test',
    getName: () => 'Toolman',
  },
}))

import {
  buildMobileAgentHostPresence,
  configureMobileAgentHost,
  handleMobileAgentHostInvoke,
} from './mobile-agent-host.service'
import { isMobileSyncEnabled, pushDesktopSyncChanges } from './mobile-sync.service'

describe('mobile-sync.service', () => {
  afterEach(() => {
    delete process.env.TOOLMAN_MOBILE_SYNC
    delete process.env.TOOLMAN_MOBILE_AGENT_HOST
  })

  it('no-ops push when explicitly disabled', async () => {
    process.env.TOOLMAN_MOBILE_SYNC = '0'
    expect(isMobileSyncEnabled()).toBe(false)
    await expect(
      pushDesktopSyncChanges([
        {
          entityKind: 'note',
          entityId: 'n1',
          op: 'upsert',
          updatedAt: 1,
          payload: { title: 't' },
        },
      ]),
    ).resolves.toBeNull()
  })

  it('accepts push when flag enabled', async () => {
    process.env.TOOLMAN_MOBILE_SYNC = '1'
    const result = await pushDesktopSyncChanges([])
    expect(result?.accepted).toBe(0)
  })
})

describe('mobile-agent-host.service', () => {
  afterEach(() => {
    delete process.env.TOOLMAN_MOBILE_SYNC
    delete process.env.TOOLMAN_MOBILE_AGENT_HOST
  })

  it('returns null presence when host flag off', () => {
    process.env.TOOLMAN_MOBILE_SYNC = '0'
    process.env.TOOLMAN_MOBILE_AGENT_HOST = '0'
    configureMobileAgentHost({ identityId: 'id', deviceId: 'dev' })
    expect(buildMobileAgentHostPresence()).toBeNull()
  })

  it('builds presence when flags on', () => {
    process.env.TOOLMAN_MOBILE_SYNC = '1'
    process.env.TOOLMAN_MOBILE_AGENT_HOST = '1'
    configureMobileAgentHost({ identityId: 'id', deviceId: 'dev' })
    const presence = buildMobileAgentHostPresence()
    expect(presence?.agentHost).toBe(true)
    expect(presence?.deviceKind).toBe('desktop')
    expect(presence?.capabilities).toContain('knowledge-search')
  })

  it('handles invoke stub', async () => {
    process.env.TOOLMAN_MOBILE_SYNC = '1'
    process.env.TOOLMAN_MOBILE_AGENT_HOST = '1'
    const result = await handleMobileAgentHostInvoke({
      capability: 'classroom',
      message: 'hello',
    })
    expect(result.ok).toBe(true)
    expect(result.text).toContain('classroom')
  })
})
