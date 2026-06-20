import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  AuthBindingRepository,
  AuthSessionRepository,
  createDatabase,
  getMigrationsPath,
  runMigrations,
  seedDefaultData,
} from '../src/index.js'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

const DEFAULT_IDENTITY_ID = '00000000-0000-0000-0000-000000000001'
const tempDir = mkdtempSync(join(tmpdir(), 'toolman-auth-schema-'))
const dbPath = join(tempDir, 'test.db')

try {
  const db = createDatabase(dbPath)
  const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
  runMigrations(db, getMigrationsPath(packageRoot))
  seedDefaultData(db)

  const sessionRepo = new AuthSessionRepository(db)
  const bindingRepo = new AuthBindingRepository(db)

  const session = sessionRepo.ensureCurrent(DEFAULT_IDENTITY_ID)
  assert(session.identityId === DEFAULT_IDENTITY_ID, 'session should bind default identity')
  assert(session.isLoggedIn === false, 'default session should be logged out')

  sessionRepo.updateCurrent({
    isLoggedIn: true,
    preferredRegion: 'cn',
    lastLoginAt: new Date(),
    accessTokenRef: 'keychain:access:test',
  })

  const loggedIn = sessionRepo.getCurrent()
  assert(loggedIn?.isLoggedIn === true, 'session should be logged in')
  assert(loggedIn?.preferredRegion === 'cn', 'preferred region should persist')

  const binding = bindingRepo.upsert({
    identityId: DEFAULT_IDENTITY_ID,
    provider: 'tencent_phone',
    subjectId: '+8613800138000',
    metadata: { label: '138****8000', phone: '+8613800138000' },
  })
  assert(binding.provider === 'tencent_phone', 'binding provider mismatch')

  const bindings = bindingRepo.listByIdentityId(DEFAULT_IDENTITY_ID)
  assert(bindings.length === 1, 'expected one binding')

  sessionRepo.clearLocalSession()
  const cleared = sessionRepo.getCurrent()
  assert(cleared?.isLoggedIn === false, 'session should clear login state')
  assert(cleared?.accessTokenRef == null, 'access token ref should be cleared')

  console.log('auth schema smoke test passed')
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}
