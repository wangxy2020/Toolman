import { mkdtempSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import { TASK_WORKSPACE_SUBDIRS } from '@toolman/shared'

vi.mock('../assistant.service', () => ({
  getAssistantRow: vi.fn(),
}))

import { getAssistantRow } from '../assistant.service'
import {
  buildTaskWorkspacePatch,
  ensureTaskWorkspaceLayout,
  resolveTaskToolWorkingDirectory,
  resolveTaskWorkspaceRootPath,
} from './task-workspace.service'

describe('task-workspace.service', () => {
  it('uses explicit workspace root when provided', () => {
    const explicit = '/tmp/custom-task-root'
    expect(
      resolveTaskWorkspaceRootPath({
        taskId: '550e8400-e29b-41d4-a716-446655440000',
        explicitWorkspaceRoot: explicit,
      }),
    ).toBe(explicit)
  })

  it('creates standard subdirectories', () => {
    const root = mkdtempSync(join(tmpdir(), 'toolman-task-'))
    ensureTaskWorkspaceLayout(root)

    for (const subdir of TASK_WORKSPACE_SUBDIRS) {
      const dir = join(root, subdir)
      expect(statSync(dir).isDirectory()).toBe(true)
      expect(readdirSync(dir)).toContain('.gitkeep')
    }
  })

  it('returns patch when layout version is missing', () => {
    const root = mkdtempSync(join(tmpdir(), 'toolman-task-'))
    const task = {
      id: '550e8400-e29b-41d4-a716-446655440001',
      workspaceRoot: root,
      assistantId: undefined,
      metadata: {},
    }

    const patch = buildTaskWorkspacePatch(task as never)
    expect(patch?.workspaceRoot).toBe(root)
    expect(patch?.metadata.workspaceLayoutVersion).toBe(1)
  })

  it('resolves tool working directory from assistant settings, not task files subdir', () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'toolman-project-'))
    const taskId = '550e8400-e29b-41d4-a716-446655440002'
    const taskRoot = join(projectDir, '.toolman', 'tasks', taskId)

    vi.mocked(getAssistantRow).mockReturnValue({
      id: 'assistant-1',
      parametersJson: JSON.stringify({ workingDirectory: projectDir }),
    } as never)

    expect(
      resolveTaskToolWorkingDirectory({
        id: taskId,
        workspaceRoot: taskRoot,
        assistantId: 'assistant-1',
        workspaceId: 'workspace-1',
      }),
    ).toBe(projectDir)
  })
})
