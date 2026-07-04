import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('../agent-runtime', () => ({
  parseAssistantRuntime: vi.fn(() => ({
    mcpServerIds: ['excel-mcp-server'],
    skillIds: [],
    autonomousMode: false,
  })),
}))

vi.mock('../agent-runtime.service', () => ({
  buildSkillsSystemHint: vi.fn(() => null),
}))

vi.mock('../assistant.service', () => ({
  getAssistantRow: vi.fn(() => ({ id: 'a1' })),
}))

vi.mock('../mcp-client-manager.service', () => ({
  ensureMcpServersConnected: vi.fn(async () => undefined),
}))

vi.mock('../tool-registry/resolve', () => ({
  resolveToolDefinitions: vi.fn(async () => [
    {
      type: 'function',
      function: {
        name: 'mcp__excel-mcp-server__read_excel',
        description: 'read excel',
        parameters: { type: 'object', properties: {} },
      },
    },
    {
      type: 'function',
      function: { name: 'bash', description: 'bash', parameters: { type: 'object', properties: {} } },
    },
  ]),
}))

vi.mock('./task-workspace.service', () => ({
  resolveTaskToolWorkingDirectory: vi.fn(() => '/tmp/work'),
}))

import { prepareTaskToolRuntime, taskHasExcelMcpTools } from './task-runtime-tool-context'
import { listPlannerToolNamesForTask } from './planner/planner-tool-utils'
import { buildHeuristicTaskPlan } from './planner/plan-repair'

const task = {
  id: 'task-1',
  assistantId: 'a1',
  workspaceId: 'w1',
  workspaceRoot: '/tmp/work/.toolman/tasks/task-1',
}

describe('task-runtime-tool-context', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('prepares tool runtime and exposes excel MCP to planner', async () => {
    const ctx = await prepareTaskToolRuntime(task)
    expect(ctx.toolNames).toContain('mcp__excel-mcp-server__read_excel')
    expect(taskHasExcelMcpTools(task)).toBe(true)
    expect(listPlannerToolNamesForTask(task)).toContain('mcp__excel-mcp-server__read_excel')
  })

  it('builds excel heuristic with canonical analysis bash', async () => {
    await prepareTaskToolRuntime(task)
    const plan = buildHeuristicTaskPlan('统计文件夹内每个价格表的货币种类和金额', task)
    expect(plan?.steps[0]?.tool?.toolName).toBe('bash')
    expect(plan?.steps[0]?.tool?.argsJson).toContain('TOOLMAN_EXCEL_ANALYSIS_V2')
  })
})
