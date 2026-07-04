import { describe, expect, it, vi } from 'vitest'

vi.mock('../task-workspace.service', () => ({
  resolveTaskToolWorkingDirectory: vi.fn(() => '/Users/wangxy/Desktop/test'),
}))

import { resolveTaskToolWorkingDirectory } from '../task-workspace.service'
import {
  normalizePlannerToolArgs,
  normalizePlannerToolName,
  normalizePlannerToolStep,
} from './planner-tool-utils'

describe('planner-tool-utils', () => {
  it('maps common hallucinated tool names', () => {
    expect(normalizePlannerToolName('web_search')).toBe('brave_web_search')
    expect(normalizePlannerToolName('create_file')).toBe('fs_write')
    expect(normalizePlannerToolName('read_excel')).toBe('mcp__excel-mcp-server__read_excel')
  })

  it('rewrites /test style paths to relative names', () => {
    const wd = '/tmp/toolman-planner'
    const args = normalizePlannerToolArgs('fs_list', { path: '/test' }, wd)
    expect(args.path).toBe('test')
  })

  it('normalizes excel file paths for read_excel', () => {
    vi.mocked(resolveTaskToolWorkingDirectory).mockReturnValue('/Users/wangxy/Desktop/test')

    const normalized = normalizePlannerToolStep(
      'read_excel',
      JSON.stringify({ filePath: '/Users/wangxy/Desktop/test/IPC_Payment_data/project_ipc_data.xlsx' }),
      {
        id: '550e8400-e29b-41d4-a716-446655440010',
        workspaceId: '00000000-0000-0000-0000-000000000002',
        assistantId: 'assistant-1',
      },
    )

    expect(normalized.toolName).toBe('mcp__excel-mcp-server__read_excel')
    expect(JSON.parse(normalized.argsJson).filePath).toBe(
      'IPC_Payment_data/project_ipc_data.xlsx',
    )
  })
})
