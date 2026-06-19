import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  installWorkflowFromMarketPackage,
  readWorkflowGraphFromPackage,
  validateWorkflowGraph,
} from './workflow-market.adapter'

const upsertStoredWorkflow = vi.fn()

vi.mock('../workflow-store.service', () => ({
  upsertStoredWorkflow: (...args: unknown[]) => upsertStoredWorkflow(...args),
}))

const tempDirs: string[] = []

function createWorkflowPackage(graph: Record<string, unknown>): string {
  const dir = join('/tmp', `toolman-workflow-adapter-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    join(dir, 'workflow.json'),
    JSON.stringify(graph),
    'utf8',
  )
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  upsertStoredWorkflow.mockReset()
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('workflow-market.adapter', () => {
  it('reads and validates langgraph workflow graph', () => {
    const packagePath = createWorkflowPackage({
      nodes: [{ id: 'start', type: 'start' }],
      edges: [],
    })

    const graph = readWorkflowGraphFromPackage(packagePath, 'workflow.json')
    expect(() => validateWorkflowGraph('langgraph', graph)).not.toThrow()
  })

  it('installs workflow into local store', () => {
    const packagePath = createWorkflowPackage({
      nodes: [{ id: 'start', type: 'start' }],
      edges: [],
    })
    upsertStoredWorkflow.mockReturnValue({
      id: 'agent-flow',
      name: 'Agent Flow',
      engine: 'langgraph',
      graphPath: 'workflow.json',
      graph: {
        nodes: [{ id: 'start', type: 'start' }],
        edges: [],
      },
      requiredMcpIds: ['browser'],
      requiredSkillIds: [],
      installedAt: 1,
      updatedAt: 1,
    })

    const workflow = installWorkflowFromMarketPackage({
      manifest: {
        schemaVersion: 1,
        workflowId: 'agent-flow',
        engine: 'langgraph',
        graphPath: 'workflow.json',
        requiredMcpIds: ['browser'],
      },
      packagePath,
      resourceId: '00000000-0000-0000-0000-000000000010',
      resourceTitle: 'Agent Flow',
    })

    expect(upsertStoredWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'agent-flow',
        name: 'Agent Flow',
        engine: 'langgraph',
        communityResourceId: '00000000-0000-0000-0000-000000000010',
      }),
    )
    expect(workflow.id).toBe('agent-flow')
  })

  it('rejects unsupported workflow engines', () => {
    expect(() =>
      validateWorkflowGraph('custom-engine', {
        nodes: [{ id: 'start' }],
      }),
    ).toThrow(/unsupported workflow engine/i)
  })
})
