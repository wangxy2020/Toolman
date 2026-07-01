import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { app } from 'electron'

import { getResourcePath } from '../../utils/resource-path.js'
import { loggerService } from './epc-logger.js'

const logger = loggerService.withContext('EpcCommercialRustCli')

const CLI_NAME = process.platform === 'win32' ? 'epc-commercial-cli.exe' : 'epc-commercial-cli'

const devMonorepoRoots = (): string[] => {
  const roots = new Set<string>()
  roots.add(process.cwd())
  if (!app.isPackaged) {
    const appPath = app.getAppPath()
    roots.add(appPath)
    roots.add(path.join(appPath, '..'))
    // electron-vite dev: appPath ≈ apps/desktop → repo root is ../..
    roots.add(path.join(appPath, '..', '..'))
    // pnpm --filter exec: cwd may be apps/desktop while crate lives at repo root
    roots.add(path.join(process.cwd(), '..', '..'))
  }
  return [...roots]
}

const devCliCandidates = (): string[] => {
  const paths: string[] = []
  for (const root of devMonorepoRoots()) {
    paths.push(path.join(root, 'packages/epc-commercial-engine/target/release', CLI_NAME))
  }
  for (const root of devMonorepoRoots()) {
    const debug = path.join(root, 'packages/epc-commercial-engine/target/debug', CLI_NAME)
    const release = path.join(root, 'packages/epc-commercial-engine/target/release', CLI_NAME)
    if (!fs.existsSync(release)) {
      paths.push(debug)
    }
  }
  return paths
}

export const resolveCliPath = (): string | null => {
  const devCandidates = devCliCandidates()
  const bundledCandidate = path.join(getResourcePath(), 'epc-commercial', CLI_NAME)
  const candidates = app.isPackaged ? [bundledCandidate, ...devCandidates] : [...devCandidates, bundledCandidate]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      let mtime: string | undefined
      try {
        mtime = fs.statSync(candidate).mtime.toISOString()
      } catch {
        mtime = undefined
      }
      logger.info('Resolved epc-commercial-cli', {
        cliPath: candidate,
        isPackaged: app.isPackaged,
        mtime,
      })
      return candidate
    }
  }
  return null
}

const shouldSkipLicenseForCli = (): boolean =>
  process.env.EPC_COMMERCIAL_DEV_SKIP_LICENSE === '1' || !app.isPackaged

const buildCliChildEnv = (): NodeJS.ProcessEnv => {
  const env = { ...process.env }
  if (shouldSkipLicenseForCli()) {
    env.EPC_COMMERCIAL_DEV_SKIP_LICENSE = '1'
  }
  return env
}

export const invokeCli = async <T>(payload: Record<string, unknown>): Promise<T> => {
  const cliPath = resolveCliPath()
  if (!cliPath) {
    throw new Error('ENGINE_NOT_FOUND')
  }

  const input = JSON.stringify(payload)
  const childEnv = buildCliChildEnv()

  return new Promise((resolve, reject) => {
    const child = spawn(cliPath, [], { stdio: ['pipe', 'pipe', 'pipe'], env: childEnv })
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.on('error', (error) => reject(error))
    child.on('close', (code) => {
      if (!stdout.trim()) {
        logger.error('Rust CLI empty stdout', { stderr, code, cliPath })
        reject(new Error(stderr || `Rust CLI exited with code ${code}`))
        return
      }
      try {
        resolve(JSON.parse(stdout) as T)
      } catch (error) {
        logger.error('Failed to parse Rust CLI JSON', { stdout, stderr, error })
        reject(error)
      }
    })

    child.stdin.write(input)
    child.stdin.end()
  })
}

export const isRustEngineAvailable = (): boolean => resolveCliPath() !== null
