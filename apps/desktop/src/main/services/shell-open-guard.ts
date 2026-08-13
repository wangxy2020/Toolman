import { extname } from 'node:path'
import { PathSandboxError, assertPathWithinAllowedRoots } from './path-sandbox.service'

const EXECUTABLE_EXTENSIONS = new Set([
  '.exe',
  '.bat',
  '.cmd',
  '.com',
  '.msi',
  '.scr',
  '.ps1',
  '.vbs',
  '.wsf',
  '.hta',
  '.cpl',
  '.msc',
  '.reg',
  '.lnk',
  '.command',
  '.sh',
  '.bash',
  '.zsh',
  '.fish',
  '.csh',
  '.ksh',
  '.app',
  '.dmg',
  '.pkg',
  '.osx',
  '.action',
  '.workflow',
  '.jar',
  '.apk',
  '.appimage',
  '.run',
  '.bin',
])

export function isExecutableLikePath(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/')
  if (/(^|\/)[^/]+\.app(\/|$)/i.test(normalized)) return true
  return EXECUTABLE_EXTENSIONS.has(extname(normalized).toLowerCase())
}

/** Open/reveal in the OS — same roots as reads, but never launch executables. */
export function assertPathSafeToOpenInShell(inputPath: string): string {
  const allowed = assertPathWithinAllowedRoots(inputPath)
  if (isExecutableLikePath(allowed)) {
    throw new PathSandboxError('不允许通过系统打开可执行文件')
  }
  return allowed
}
