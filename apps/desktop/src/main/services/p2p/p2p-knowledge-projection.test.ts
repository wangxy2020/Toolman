import { describe, expect, it } from 'vitest'

describe('reconcileKnowledgeSharedResources', () => {
  it('is exported for resource list repair', async () => {
    const mod = await import('./p2p-knowledge-projection')
    expect(typeof mod.reconcileKnowledgeSharedResources).toBe('function')
    expect(typeof mod.projectKnowledgeSharedEvent).toBe('function')
  })
})
