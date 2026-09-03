import { chmod, mkdir, readFile, rm, utimes, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/toolman-test-community-hub-bin',
    isPackaged: false,
  },
}))

import { COMMUNITY_HUB_BINARY_NAME } from '../community-paths'
import { materializeHubBinary } from './process'

describe('materializeHubBinary', () => {
  it('copies the source binary into the community data dir', async () => {
    const root = join(tmpdir(), `toolman-hub-bin-${Date.now()}`)
    const sourcePath = join(root, 'source-hub')
    const dataDir = join(root, 'data')
    await mkdir(root, { recursive: true })
    await writeFile(sourcePath, 'hub-binary-v1')
    await chmod(sourcePath, 0o755)

    const destPath = await materializeHubBinary(sourcePath, dataDir)
    expect(destPath).toBe(join(dataDir, 'bin', COMMUNITY_HUB_BINARY_NAME))
    expect(await readFile(destPath, 'utf8')).toBe('hub-binary-v1')

    await rm(root, { recursive: true, force: true })
  })

  it('refreshes the runtime copy when the source binary is newer', async () => {
    const root = join(tmpdir(), `toolman-hub-bin-${Date.now()}-refresh`)
    const sourcePath = join(root, 'source-hub')
    const dataDir = join(root, 'data')
    await mkdir(join(dataDir, 'bin'), { recursive: true })
    await writeFile(sourcePath, 'hub-binary-v2')
    await chmod(sourcePath, 0o755)
    const destPath = join(dataDir, 'bin', COMMUNITY_HUB_BINARY_NAME)
    await writeFile(destPath, 'hub-binary-v1')
    const past = new Date(Date.now() - 60_000)
    await utimes(destPath, past, past)

    const result = await materializeHubBinary(sourcePath, dataDir)
    expect(result).toBe(destPath)
    expect(await readFile(destPath, 'utf8')).toBe('hub-binary-v2')

    await rm(root, { recursive: true, force: true })
  })
})
