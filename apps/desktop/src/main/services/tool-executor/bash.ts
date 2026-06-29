import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { buildSandboxedBashEnv } from '../bash-env.util'
import { parseEnvironmentVariables } from '../permission.service'
import type { ToolExecutionContext } from './types'
import { sandboxFor } from './types'

const execFileAsync = promisify(execFile)

export async function executeBash(args: Record<string, unknown>, context: ToolExecutionContext) {
  const command = String(args.command ?? '').trim()
  if (!command) throw new Error('缺少 command')

  const sandbox = sandboxFor(context)
  const cwd = args.cwd ? sandbox.resolveDirectory(String(args.cwd)) : sandbox.rootReal
  const env = buildSandboxedBashEnv(parseEnvironmentVariables(context.environmentVariables))

  const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/bash'
  const shellArgs = process.platform === 'win32' ? ['/d', '/s', '/c', command] : ['-lc', command]

  const { stdout, stderr } = await execFileAsync(shell, shellArgs, {
    cwd,
    env,
    maxBuffer: 1024 * 1024,
    timeout: 60_000,
  })

  const output = [stdout, stderr].filter(Boolean).join('\n').trim()
  return output || '(命令执行完成，无输出)'
}
