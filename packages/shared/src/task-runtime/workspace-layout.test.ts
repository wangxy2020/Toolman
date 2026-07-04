import { describe, expect, it } from 'vitest'

import {
  TASK_WORKSPACE_SUBDIRS,
  joinTaskWorkspaceSubdir,
  taskFilesDirFromRoot,
  taskSnapshotPathFromRoot,
} from './workspace-layout.js'

describe('workspace-layout', () => {
  it('lists expected subdirectories', () => {
    expect(TASK_WORKSPACE_SUBDIRS).toEqual([
      'files',
      'artifacts',
      'cache',
      'temp',
      'logs',
      'checkpoints',
    ])
  })

  it('joins subdir paths', () => {
    expect(joinTaskWorkspaceSubdir('/tmp/task', 'logs')).toBe('/tmp/task/logs')
    expect(joinTaskWorkspaceSubdir('/tmp/task/', 'files')).toBe('/tmp/task/files')
  })

  it('resolves files dir and snapshot path', () => {
    expect(taskFilesDirFromRoot('/data/tasks/abc')).toBe('/data/tasks/abc/files')
    expect(taskSnapshotPathFromRoot('/data/tasks/abc/')).toBe('/data/tasks/abc/task.json')
  })
})
