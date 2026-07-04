import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import type { AgentTask } from '@toolman/shared'

vi.mock('./artifact.service', () => ({
  listTaskArtifacts: vi.fn(() => ({ items: [] })),
}))

vi.mock('../assistant.service', () => ({
  getAssistantRow: vi.fn(),
}))

vi.mock('../agent-runtime', () => ({
  resolveAssistantWorkingDirectory: vi.fn((assistant: { parametersJson?: string } | null) => {
    if (!assistant?.parametersJson) return undefined
    const parsed = JSON.parse(assistant.parametersJson) as { workingDirectory?: string }
    return parsed.workingDirectory
  }),
  parseAssistantRuntime: vi.fn(() => ({ mcpServerIds: [], toolContext: { environmentVariables: {} } })),
}))

vi.mock('../permission.service', () => ({
  resolveWorkingDirectory: vi.fn((dir: string) => dir),
}))

import { getAssistantRow } from '../assistant.service'
import {
  collectTaskOutputPathsFromHistory,
  discoverTaskOutputFilePaths,
  extractFileCandidatesFromText,
  extractTaskToolOutputPathsFromArgs,
  resolveTaskOutputFilePath,
} from './task-output-files'

const baseTask = (overrides: Partial<AgentTask> = {}): AgentTask => ({
  id: '550e8400-e29b-41d4-a716-446655440000',
  workspaceId: '00000000-0000-0000-0000-000000000002',
  title: '目录整理',
  goal: '整理目录表',
  status: 'completed',
  retryCount: 0,
  history: [],
  budget: {
    preset: 'network',
    maxPlannerTokens: 8000,
    maxExecutorTokensPerStep: 4000,
    maxReflectionTokens: 4000,
    maxTotalTokens: 120_000,
    maxSteps: 30,
    used: { planner: 0, executor: 0, reflection: 0, total: 0 },
  },
  metadata: {},
  createdAt: Date.now(),
  updatedAt: Date.now(),
  ...overrides,
})

describe('task-output-files', () => {
  it('resolves output paths from assistant working directory, not task sandbox only', () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'toolman-project-'))
    const taskRoot = join(projectDir, '.toolman', 'tasks', 'task-1')
    const outputPath = join(projectDir, '保险理赔文件目录表.xlsx')
    writeFileSync(outputPath, 'xlsx')

    vi.mocked(getAssistantRow).mockReturnValue({
      id: 'assistant-1',
      parametersJson: JSON.stringify({ workingDirectory: projectDir }),
    } as never)

    const task = baseTask({
      assistantId: 'assistant-1',
      workspaceRoot: taskRoot,
      history: [
        {
          id: 'step-1',
          kind: 'tool',
          title: 'Write excel',
          status: 'completed',
          retryCount: 0,
          input: {
            toolName: 'fs_write',
            argsJson: JSON.stringify({ path: '保险理赔文件目录表.xlsx', content: 'xlsx' }),
          },
          output: { text: `已写入文件: ${outputPath}` },
        },
      ],
    })

    expect(collectTaskOutputPathsFromHistory(task)).toEqual([outputPath])
    expect(discoverTaskOutputFilePaths(task)).toEqual([outputPath])
    expect(resolveTaskOutputFilePath(task, '保险理赔文件目录表.xlsx')).toBe(outputPath)
  })

  it('does not treat read_excel paths as generated outputs', () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'toolman-project-'))
    const inputPath = join(projectDir, 'source.xlsx')
    writeFileSync(inputPath, 'xlsx')

    vi.mocked(getAssistantRow).mockReturnValue({
      id: 'assistant-1',
      parametersJson: JSON.stringify({ workingDirectory: projectDir }),
    } as never)

    const task = baseTask({
      assistantId: 'assistant-1',
      history: [
        {
          id: 'step-1',
          kind: 'tool',
          title: 'Read excel',
          status: 'completed',
          retryCount: 0,
          input: {
            toolName: 'mcp__excel-mcp-server__read_excel',
            argsJson: JSON.stringify({ filePath: 'source.xlsx' }),
          },
          output: {
            text: JSON.stringify({ filePath: inputPath, sheets: [] }, null, 2),
          },
        },
      ],
    })

    expect(collectTaskOutputPathsFromHistory(task)).toEqual([])
  })

  it('prefers modify_excel outputPath over source filePath', () => {
    expect(
      extractTaskToolOutputPathsFromArgs(
        'mcp__excel-mcp-server__modify_excel_cells',
        JSON.stringify({
          filePath: 'source.xlsx',
          outputPath: '目录表.xlsx',
        }),
      ),
    ).toEqual(['目录表.xlsx'])
  })

  it('collects targetPath from excel MCP JSON output', () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'toolman-project-'))
    const taskRoot = join(projectDir, '.toolman', 'tasks', 'task-1')
    const outputPath = join(projectDir, '目录表.xlsx')
    writeFileSync(outputPath, 'xlsx')

    vi.mocked(getAssistantRow).mockReturnValue({
      id: 'assistant-1',
      parametersJson: JSON.stringify({ workingDirectory: projectDir }),
    } as never)

    const task = baseTask({
      assistantId: 'assistant-1',
      workspaceRoot: taskRoot,
      history: [
        {
          id: '550e8400-e29b-41d4-a716-446655440001',
          kind: 'tool',
          title: 'Modify excel',
          status: 'completed',
          retryCount: 0,
          input: {
            toolName: 'mcp__excel-mcp-server__modify_excel_cells',
            argsJson: JSON.stringify({
              filePath: join(projectDir, 'template.xlsx'),
              outputPath: '目录表.xlsx',
              changes: [{ sheet: 'Sheet1', cell: 'A1', value: 'name' }],
            }),
          },
          output: {
            text: JSON.stringify({ sourcePath: join(projectDir, 'template.xlsx'), targetPath: outputPath }, null, 2),
          },
        },
      ],
    })

    expect(collectTaskOutputPathsFromHistory(task)).toEqual([outputPath])
  })

  it('prefers bash output over mtime scan when history has write step', () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'toolman-project-'))
    const taskRoot = join(projectDir, '.toolman', 'tasks', 'task-1')
    const stalePath = join(projectDir, '文件目录清单-1.xlsx')
    const outputPath = join(projectDir, 'directory_list.xlsx')
    writeFileSync(stalePath, 'old')
    writeFileSync(outputPath, 'new')

    vi.mocked(getAssistantRow).mockReturnValue({
      id: 'assistant-1',
      parametersJson: JSON.stringify({ workingDirectory: projectDir }),
    } as never)

    const startedAt = Date.now() - 1000
    const task = baseTask({
      assistantId: 'assistant-1',
      workspaceRoot: taskRoot,
      createdAt: startedAt,
      updatedAt: Date.now(),
      history: [
        {
          id: 'step-1',
          kind: 'tool',
          title: 'Write excel',
          status: 'completed',
          retryCount: 0,
          input: {
            toolName: 'bash',
            argsJson: JSON.stringify({
              command: "python3 <<'PY'\nout = 'directory_list.xlsx'\nPY",
            }),
          },
          output: { text: `已写入文件: ${outputPath}` },
        },
      ],
    })

    expect(discoverTaskOutputFilePaths(task)).toEqual([outputPath])
  })

  it('discovers files mentioned in reflection summary text', () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'toolman-project-'))
    const outputPath = join(projectDir, 'directory_listing.csv')
    writeFileSync(outputPath, 'path,type\n')

    vi.mocked(getAssistantRow).mockReturnValue({
      id: 'assistant-1',
      parametersJson: JSON.stringify({ workingDirectory: projectDir }),
    } as never)

    const task = baseTask({
      assistantId: 'assistant-1',
      workspaceRoot: join(projectDir, '.toolman', 'tasks', 'task-1'),
      status: 'completed',
      metadata: {
        lastReflection: {
          verdict: 'pass',
          summary: '已将目录清单写入 directory_listing.csv 文件。',
        },
      },
    })

    const reflection = task.metadata.lastReflection as { summary?: string }
    expect(extractFileCandidatesFromText(reflection.summary!)).toContain('directory_listing.csv')
    expect(discoverTaskOutputFilePaths(task)).toEqual([outputPath])
  })

  it('discovers files mentioned with 保存位置 prose', () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'toolman-project-'))
    const outputPath = join(projectDir, '文件目录清单.xlsx')
    writeFileSync(outputPath, 'xlsx')

    vi.mocked(getAssistantRow).mockReturnValue({
      id: 'assistant-1',
      parametersJson: JSON.stringify({ workingDirectory: projectDir }),
    } as never)

    const summary = `✅ 文件目录清单已生成\n保存位置： ${outputPath}`
    const prosePaths = extractFileCandidatesFromText(summary)
    expect(prosePaths.some((path) => path.includes('文件目录清单.xlsx'))).toBe(true)

    const task = baseTask({
      assistantId: 'assistant-1',
      workspaceRoot: join(projectDir, '.toolman', 'tasks', 'task-1'),
      status: 'completed',
      metadata: {
        lastReflection: {
          verdict: 'pass',
          summary,
        },
      },
    })

    expect(discoverTaskOutputFilePaths(task)).toContain(outputPath)
  })
})
