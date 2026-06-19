import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getStoredWorkflow,
  listStoredWorkflows,
  upsertStoredWorkflow,
} from './workflow-store.service'

const tempRoot = join('/tmp', `toolman-workflow-store-${Date.now()}`)

vi.mock('electron', () => ({
  app: {
    getPath: () => tempRoot,
  },
}))

describe('workflow-store.service', () => {
  beforeEach(() => {
    mkdirSync(tempRoot, { recursive: true })
  })

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true })
  })

  it('persists and lists stored workflows', () => {
    upsertStoredWorkflow({
      id: 'agent-flow',
      name: 'Agent Flow',
      engine: 'langgraph',
      graphPath: 'workflow.json',
      graph: {
        nodes: [{ id: 'start', type: 'start' }],
        edges: [],
      },
      communityResourceId: '00000000-0000-0000-0000-000000000010',
    })

    const items = listStoredWorkflows()
    expect(items).toHaveLength(1)
    expect(items[0]?.id).toBe('agent-flow')
    expect(getStoredWorkflow('agent-flow')?.name).toBe('Agent Flow')
  })
})
