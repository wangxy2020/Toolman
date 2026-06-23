import { describe, expect, it } from 'vitest'
import { resolveAuthoritativeSessionIds } from './p2p-agent-projection'

describe('resolveAuthoritativeSessionIds', () => {
  it('keeps existing ids when payload omits session_ids', () => {
    expect(resolveAuthoritativeSessionIds(['a', 'b'], {})).toEqual(['a', 'b'])
  })

  it('replaces existing ids when payload includes session_ids', () => {
    expect(
      resolveAuthoritativeSessionIds(['old-1', 'old-2'], {
        session_ids: ['new-1'],
      }),
    ).toEqual(['new-1'])
  })

  it('clears ids when payload includes an empty session_ids array', () => {
    expect(
      resolveAuthoritativeSessionIds(['old-1'], {
        session_ids: [],
      }),
    ).toBeUndefined()
  })

  it('deduplicates incoming session ids', () => {
    expect(
      resolveAuthoritativeSessionIds(undefined, {
        session_ids: ['a', 'a', 'b'],
      }),
    ).toEqual(['a', 'b'])
  })
})

describe('reconcileAgentSharedResources', () => {
  it('is exported for catch-up reconciliation', async () => {
    const mod = await import('./p2p-agent-projection')
    expect(typeof mod.reconcileAgentSharedResources).toBe('function')
  })
})
