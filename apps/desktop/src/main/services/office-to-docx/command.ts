import { access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { spawn } from 'node:child_process'
import { platform } from 'node:os'
import { OfficeToDocxError } from './types'

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

export function whichBinary(name: string): Promise<string | null> {
  return new Promise((resolve) => {
    const command = platform() === 'win32' ? 'where' : 'which'
    const child = spawn(command, [name], { stdio: ['ignore', 'pipe', 'ignore'] })
    let stdout = ''
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })
    child.on('error', () => resolve(null))
    child.on('close', (code) => {
      if (code !== 0) {
        resolve(null)
        return
      }
      const first = stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean)
      resolve(first ?? null)
    })
  })
}

export function runCommand(
  command: string,
  args: string[],
  options?: { timeoutMs?: number },
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    let timedOut = false

    const timer =
      options?.timeoutMs != null
        ? setTimeout(() => {
            timedOut = true
            child.kill('SIGTERM')
          }, options.timeoutMs)
        : null

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })
    child.on('error', (error) => {
      if (timer) clearTimeout(timer)
      reject(error)
    })
    child.on('close', (code) => {
      if (timer) clearTimeout(timer)
      if (timedOut) {
        reject(new OfficeToDocxError('Office 文档转换超时'))
        return
      }
      if (code !== 0) {
        reject(
          new OfficeToDocxError(
            stderr.trim() || stdout.trim() || `命令失败 (${command} ${args.join(' ')})`,
          ),
        )
        return
      }
      resolve({ stdout, stderr })
    })
  })
}
