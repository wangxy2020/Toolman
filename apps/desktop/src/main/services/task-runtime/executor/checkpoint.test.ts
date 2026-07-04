import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, afterEach } from 'vitest'

import { ensureTaskWorkspaceLayout } from '../task-workspace.service'
import {
  cleanupTaskToolCheckpoint,
  createTaskToolCheckpoint,
  rollbackTaskToolCheckpoint,
} from './checkpoint'

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

function makeTaskWorkspace() {
  const taskRoot = mkdtempSync(join(tmpdir(), 'toolman-checkpoint-'))
  tempDirs.push(taskRoot)
  ensureTaskWorkspaceLayout(taskRoot)
  return taskRoot
}

describe('task tool checkpoint', () => {
  it('creates checkpoint and restores file after failed write', () => {
    const taskRoot = makeTaskWorkspace()
    const filesDir = join(taskRoot, 'files')
    const target = join(filesDir, 'draft.md')
    writeFileSync(target, 'original', 'utf8')

    const task = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      workspaceId: '00000000-0000-0000-0000-000000000002',
      workspaceRoot: taskRoot,
    } as const

    const checkpoint = createTaskToolCheckpoint({
      task,
      toolName: 'fs_write',
      argsJson: JSON.stringify({ path: 'draft.md', content: 'broken' }),
      context: { workingDirectory: filesDir },
    })

    expect(checkpoint).not.toBeNull()
    writeFileSync(target, 'broken', 'utf8')

    rollbackTaskToolCheckpoint(checkpoint!)
    expect(readFileSync(target, 'utf8')).toBe('original')
  })

  it('removes newly created file on rollback', () => {
    const taskRoot = makeTaskWorkspace()
    const filesDir = join(taskRoot, 'files')
    const target = join(filesDir, 'new-file.txt')

    const task = {
      id: '550e8400-e29b-41d4-a716-446655440001',
      workspaceId: '00000000-0000-0000-0000-000000000002',
      workspaceRoot: taskRoot,
    } as const

    const checkpoint = createTaskToolCheckpoint({
      task,
      toolName: 'fs_write',
      argsJson: JSON.stringify({ path: 'new-file.txt', content: 'x' }),
      context: { workingDirectory: filesDir },
    })

    expect(checkpoint).not.toBeNull()
    writeFileSync(target, 'x', 'utf8')
    expect(existsSync(target)).toBe(true)

    rollbackTaskToolCheckpoint(checkpoint!)
    expect(existsSync(target)).toBe(false)
  })

  it('cleans up checkpoint directory', () => {
    const taskRoot = makeTaskWorkspace()
    const filesDir = join(taskRoot, 'files')
    mkdirSync(filesDir, { recursive: true })

    const task = {
      id: '550e8400-e29b-41d4-a716-446655440002',
      workspaceId: '00000000-0000-0000-0000-000000000002',
      workspaceRoot: taskRoot,
    } as const

    const checkpoint = createTaskToolCheckpoint({
      task,
      toolName: 'fs_write',
      argsJson: JSON.stringify({ path: 'missing.md', content: 'x' }),
      context: { workingDirectory: filesDir },
    })

    expect(checkpoint).not.toBeNull()
    expect(existsSync(checkpoint!.dir)).toBe(true)
    cleanupTaskToolCheckpoint(checkpoint!)
    expect(existsSync(checkpoint!.dir)).toBe(false)
  })

  it('skips readonly tools', () => {
    const taskRoot = makeTaskWorkspace()
    const task = {
      id: '550e8400-e29b-41d4-a716-446655440003',
      workspaceId: '00000000-0000-0000-0000-000000000002',
      workspaceRoot: taskRoot,
    } as const

    const checkpoint = createTaskToolCheckpoint({
      task,
      toolName: 'fs_read',
      argsJson: JSON.stringify({ path: 'a.txt' }),
      context: { workingDirectory: join(taskRoot, 'files') },
    })

    expect(checkpoint).toBeNull()
  })
})
