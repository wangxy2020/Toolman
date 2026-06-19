import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createDatabase,
  getMigrationsPath,
  runMigrations,
  seedDefaultData,
  P2pEventRepository,
  P2pMemberRepository,
  P2pWorkspaceRepository,
  hashWorkspaceKey,
} from '../src/index.js'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

const tempDir = mkdtempSync(join(tmpdir(), 'toolman-p2p-schema-'))
const dbPath = join(tempDir, 'test.db')

try {
  const db = createDatabase(dbPath)
  const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
  runMigrations(db, getMigrationsPath(packageRoot))
  seedDefaultData(db)

  const workspaceRepo = new P2pWorkspaceRepository(db)
  const memberRepo = new P2pMemberRepository(db)
  const eventRepo = new P2pEventRepository(db)

  const workspace = workspaceRepo.create({
    name: '默认空间',
    ownerDeviceId: 'device-owner-1',
    ownerIdentityId: '00000000-0000-0000-0000-000000000001',
    workspaceKeyHash: hashWorkspaceKey('test-workspace-key'),
  })

  const owner = memberRepo.create({
    workspaceId: workspace.id,
    identityId: '00000000-0000-0000-0000-000000000001',
    deviceId: 'device-owner-1',
    displayName: '本地用户',
    role: 'owner',
    status: 'active',
    joinedAt: new Date(),
  })

  const event = eventRepo.append({
    workspaceId: workspace.id,
    resourceType: 'Workspace',
    resourceId: workspace.id,
    operatorId: owner.id,
    eventType: 'Created',
    payload: { name: workspace.name },
    sourceDeviceId: 'device-owner-1',
  })

  assert(event.seq === 1, 'expected first event seq to be 1')
  assert(event.payloadHash.length === 64, 'expected sha256 payload hash')

  const listed = eventRepo.list({ workspaceId: workspace.id })
  assert(listed.length === 1, 'expected one event in workspace log')
  assert(listed[0]?.id === event.id, 'listed event id mismatch')

  const reloaded = workspaceRepo.findById(workspace.id)
  assert(reloaded?.lastEventSeq === 1, 'workspace last_event_seq should advance')

  console.log('p2p schema smoke test passed')
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}
