import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createInMemoryAgentTaskRepository,
  type InMemoryAgentTaskRepository,
} from './testing/in-memory-agent-task.repository'

const DEFAULT_ASSISTANT_ID = '00000000-0000-0000-0000-000000000003'
const DEFAULT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000002'
const LEGACY_TASK_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'

const harness = vi.hoisted(() => ({
  tempUserData: '',
  repo: null as InMemoryAgentTaskRepository | null,
}))

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name === 'userData') return harness.tempUserData
      return join(harness.tempUserData, name)
    },
    getVersion: () => '0.2.0-test',
  },
  BrowserWindow: {
    getAllWindows: () => [],
  },
}))

vi.mock('@toolman/db', () => ({
  AgentTaskRepository: class {
    constructor() {
      if (!harness.repo) {
        throw new Error('in-memory task repository not initialized')
      }
      return harness.repo
    }
  },
}))

vi.mock('../../bootstrap/database', () => ({
  getDatabase: () => ({}),
}))

vi.mock('../assistant.service', () => ({
  listAssistants: vi.fn(() => [{ id: DEFAULT_ASSISTANT_ID }]),
  getAssistantRow: vi.fn((assistantId: string) => ({
    id: assistantId,
    workspaceId: DEFAULT_WORKSPACE_ID,
    modelId: '00000000-0000-0000-0000-000000000004:gemma4:latest',
    parametersJson: '{}',
  })),
}))

vi.mock('./snapshot', () => ({
  syncTaskSnapshotFromDb: vi.fn(),
}))

vi.mock('./task-workspace.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./task-workspace.service')>()
  return {
    ...actual,
    buildTaskWorkspacePatch: vi.fn(() => null),
  }
})

function writeLegacyAgentTasksFile(tasks: unknown[]): void {
  const dir = join(harness.tempUserData, 'agent-tasks')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${DEFAULT_ASSISTANT_ID}.json`), JSON.stringify(tasks), 'utf8')
}

describe('legacy agent task migration integration', () => {
  beforeEach(() => {
    harness.repo = createInMemoryAgentTaskRepository()
    harness.tempUserData = mkdtempSync(join(tmpdir(), 'toolman-task-legacy-migrate-'))
  })

  afterEach(() => {
    rmSync(harness.tempUserData, { recursive: true, force: true })
    harness.repo = null
    vi.resetModules()
  })

  it('imports legacy agent-tasks JSON into SQLite and is idempotent', async () => {
    writeLegacyAgentTasksFile([
      {
        id: LEGACY_TASK_ID,
        title: 'Legacy checklist item',
        status: 'in_progress',
        notes: 'from agent-tasks json',
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_100_000,
      },
      {
        id: 'bbbbbbbb-bbbb-4ccc-8ddd-ffffffffffff',
        title: 'Completed legacy task',
        status: 'completed',
        createdAt: 1_700_000_200_000,
        updatedAt: 1_700_000_300_000,
      },
    ])

    const { migrateLegacyAgentTasksFile, migrateAllLegacyAgentTasks, getAgentTask } = await import(
      './store'
    )

    expect(migrateLegacyAgentTasksFile(DEFAULT_ASSISTANT_ID)).toBe(2)

    const imported = getAgentTask(LEGACY_TASK_ID)
    expect(imported).not.toBeNull()
    expect(imported?.title).toBe('Legacy checklist item')
    expect(imported?.status).toBe('executing')
    expect(imported?.notes).toBe('from agent-tasks json')
    expect(imported?.metadata.legacyImport).toBe(true)

    const completed = getAgentTask('bbbbbbbb-bbbb-4ccc-8ddd-ffffffffffff')
    expect(completed?.status).toBe('completed')

    expect(migrateLegacyAgentTasksFile(DEFAULT_ASSISTANT_ID)).toBe(0)
    expect(migrateAllLegacyAgentTasks([DEFAULT_ASSISTANT_ID])).toBe(0)
  })

  it('bootstrapTaskRuntimeLegacyMigration imports once on startup', async () => {
    writeLegacyAgentTasksFile([
      {
        id: LEGACY_TASK_ID,
        title: 'Bootstrapped legacy task',
        status: 'pending',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ])

    vi.resetModules()

    const bootstrap = await import('./bootstrap')
    const { getAgentTask } = await import('./store')

    bootstrap.bootstrapTaskRuntimeLegacyMigration()
    bootstrap.bootstrapTaskRuntimeLegacyMigration()

    const task = getAgentTask(LEGACY_TASK_ID)
    expect(task?.title).toBe('Bootstrapped legacy task')
    expect(task?.status).toBe('pending')
  })
})
