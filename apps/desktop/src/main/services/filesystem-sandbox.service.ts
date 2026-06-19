import { existsSync, lstatSync, realpathSync } from 'node:fs'
import { basename, isAbsolute, relative, resolve } from 'node:path'
import { resolveWorkingDirectory } from './permission.service'

export class FilesystemSandbox {
  readonly root: string
  /** Resolved real path of workspace root (symlink-safe). */
  readonly rootReal: string

  constructor(root: string) {
    this.root = resolve(root)
    this.rootReal = realpathSync.native(this.root)
  }

  static fromContext(workingDirectory?: string): FilesystemSandbox {
    return new FilesystemSandbox(resolveWorkingDirectory(workingDirectory))
  }

  resolveInside(inputPath: string): string {
    const candidate = isAbsolute(inputPath) ? resolve(inputPath) : resolve(this.root, inputPath)
    return this.validateExistingOrParent(candidate)
  }

  resolveDirectory(inputPath?: string): string {
    if (!inputPath?.trim()) return this.rootReal
    return this.validateExistingOrParent(resolve(this.root, inputPath))
  }

  validateExistingOrParent(target: string): string {
    const normalized = resolve(target)
    if (existsSync(normalized)) {
      return this.validateRealPath(realpathSync.native(normalized))
    }

    const parent = resolve(normalized, '..')
    if (!existsSync(parent)) {
      throw new Error('路径超出工作目录范围')
    }
    const parentReal = realpathSync.native(parent)
    this.assertInsideRoot(parentReal)
    return resolve(parentReal, basename(normalized))
  }

  validateRealPath(realTarget: string): string {
    return this.assertInsideRoot(realpathSync.native(realTarget))
  }

  private assertInsideRoot(realTarget: string): string {
    const rel = relative(this.rootReal, realTarget)
    if (rel.startsWith('..') || isAbsolute(rel)) {
      throw new Error('路径超出工作目录范围')
    }
    return realTarget
  }

  shouldSkipEntry(name: string): boolean {
    return name.startsWith('.') || name === 'node_modules'
  }

  isSafeDirectoryEntry(parentDir: string, entryName: string): boolean {
    const entryPath = resolve(parentDir, entryName)
    try {
      if (!existsSync(entryPath)) return false
      const stat = lstatSync(entryPath)
      if (stat.isSymbolicLink()) {
        this.validateRealPath(realpathSync.native(entryPath))
      } else {
        this.validateExistingOrParent(entryPath)
      }
      return true
    } catch {
      return false
    }
  }
}
