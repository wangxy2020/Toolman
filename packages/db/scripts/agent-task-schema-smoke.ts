import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  createDatabase,
  runMigrations,
  getMigrationsPath,
  seedDefaultData,
  AgentTaskRepository,
  AgentTaskArtifactRepository,
} from '../src/index.js'

const dir = mkdtempSync(join(tmpdir(), 'toolman-agent-task-smoke-'))
const dbPath = join(dir, 'toolman.db')

try {
  const db = createDatabase(dbPath)
  const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
  runMigrations(db, getMigrationsPath(packageRoot))
  seedDefaultData(db)

  const repo = new AgentTaskRepository(db)
  const artifactRepo = new AgentTaskArtifactRepository(db)
  const workspaceId = '00000000-0000-0000-0000-000000000002'
  const taskRoot = join(dir, 'task-workspace')

  const task = repo.create({
    workspaceId,
    title: 'Smoke test task',
    executorModelId: 'ollama:gemma3:12b',
    workspaceRoot: taskRoot,
  })

  if (task.status !== 'pending') {
    throw new Error(`expected pending, got ${task.status}`)
  }
  if (task.budget.preset !== 'local') {
    throw new Error(`expected local budget preset, got ${task.budget.preset}`)
  }

  const locked = repo.tryAcquireGlobalLock(task.id, 'worker-smoke')
  if (!locked) {
    throw new Error('failed to acquire global lock')
  }

  const updated = repo.update(task.id, { status: 'executing', retryCount: 1 })
  if (updated.status !== 'executing' || updated.retryCount !== 1) {
    throw new Error('update failed')
  }

  repo.releaseGlobalLock(task.id)
  if (repo.getGlobalLock() !== null) {
    throw new Error('lock not released')
  }

  const artifactPath = join(dir, 'report.md')
  writeFileSync(artifactPath, '# smoke artifact', 'utf8')
  const artifact = artifactRepo.create({
    taskId: task.id,
    name: 'Smoke report',
    kind: 'report',
    relativePath: 'report.md',
    absolutePath: join(taskRoot, 'artifacts', 'report.md'),
    mimeType: 'text/markdown',
    sizeBytes: 15,
  })
  if (artifactRepo.listByTask(task.id).length !== 1) {
    throw new Error('artifact list failed')
  }
  if (artifact.name !== 'Smoke report') {
    throw new Error('artifact create failed')
  }

  console.log('agent-task schema smoke: ok')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
