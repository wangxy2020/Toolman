import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { join, relative, resolve } from 'node:path'
import type { ToolExecutionContext } from './types'
import { sandboxFor } from './types'

export async function walkFiles(
  sandbox: ReturnType<typeof sandboxFor>,
  root: string,
  matcher: (filePath: string) => boolean,
  results: string[],
) {
  if (results.length >= 200) return

  let entries
  try {
    entries = readdirSync(root, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    if (results.length >= 200) break
    if (sandbox.shouldSkipEntry(entry.name)) continue

    const fullPath = join(root, entry.name)
    if (!sandbox.isSafeDirectoryEntry(root, entry.name)) continue

    try {
      if (entry.isDirectory()) {
        const dirReal = realpathSync.native(fullPath)
        sandbox.validateRealPath(dirReal)
        await walkFiles(sandbox, dirReal, matcher, results)
        continue
      }

      const fileReal = realpathSync.native(fullPath)
      sandbox.validateRealPath(fileReal)
      if (entry.isFile() && matcher(fileReal)) {
        results.push(fileReal)
      }
    } catch {
      // skip unreadable or escaped paths
    }
  }
}

export function globToRegExp(pattern: string): RegExp {
  const normalized = pattern.replace(/\\/g, '/')
  if (normalized === '**' || normalized === '**/*' || normalized === '**/**') {
    return /^.*$/
  }

  const escaped = normalized
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '::DOUBLE_STAR::')
    .replace(/\*/g, '[^/]*')
    .replace(/::DOUBLE_STAR::/g, '.*')
    .replace(/\?/g, '.')
  return new RegExp(`^${escaped}$`)
}

export async function executeFsGlob(args: Record<string, unknown>, context: ToolExecutionContext) {
  const pattern = String(args.pattern ?? '')
  if (!pattern) throw new Error('缺少 pattern')

  const sandbox = sandboxFor(context)
  const cwd = args.path || args.cwd
    ? sandbox.resolveDirectory(String(args.path ?? args.cwd))
    : sandbox.rootReal
  const regex = globToRegExp(pattern.replace(/\\/g, '/'))
  const results: string[] = []

  await walkFiles(
    sandbox,
    cwd,
    (filePath) => regex.test(relative(cwd, filePath).replace(/\\/g, '/')),
    results,
  )

  if (!results.length) return '未找到匹配文件'
  const header =
    results.length >= 200 ? `找到至少 ${results.length} 个匹配文件（列表已截断）：\n` : `找到 ${results.length} 个匹配文件：\n`
  return header + results.join('\n')
}

export async function executeFsGrep(args: Record<string, unknown>, context: ToolExecutionContext) {
  const pattern = String(args.pattern ?? '')
  const pathArg = String(args.path ?? '.')
  if (!pattern) throw new Error('缺少 pattern')

  const sandbox = sandboxFor(context)
  const target = sandbox.resolveInside(pathArg)
  const ignoreCase = Boolean(args.ignoreCase)
  const regex = new RegExp(pattern, ignoreCase ? 'i' : undefined)
  const matches: string[] = []

  const scanFile = (filePath: string) => {
    const content = readFileSync(filePath, 'utf-8')
    content.split('\n').forEach((line, index) => {
      if (regex.test(line)) {
        matches.push(`${filePath}:${index + 1}:${line}`)
      }
    })
  }

  const stat = statSync(target)
  if (stat.isFile()) {
    scanFile(target)
  } else if (stat.isDirectory()) {
    const files: string[] = []
    await walkFiles(sandbox, target, () => true, files)
    for (const file of files) {
      if (matches.length >= 200) break
      try {
        scanFile(file)
      } catch {
        // skip unreadable files
      }
    }
  }

  return matches.length ? matches.slice(0, 200).join('\n') : '未找到匹配内容'
}

export async function executeFsEdit(args: Record<string, unknown>, context: ToolExecutionContext) {
  const pathArg = String(args.path ?? '')
  const oldText = String(args.oldText ?? '')
  const newText = String(args.newText ?? '')
  if (!pathArg || !oldText) throw new Error('缺少 path 或 oldText')

  const filePath = sandboxFor(context).resolveInside(pathArg)
  const content = readFileSync(filePath, 'utf-8')
  if (!content.includes(oldText)) {
    throw new Error('未在文件中找到要替换的文本')
  }
  writeFileSync(filePath, content.replace(oldText, newText), 'utf-8')
  return `已更新文件: ${filePath}`
}

export function executeFsDelete(args: Record<string, unknown>, context: ToolExecutionContext) {
  const pathArg = String(args.path ?? '')
  if (!pathArg) throw new Error('缺少 path')

  const filePath = sandboxFor(context).resolveInside(pathArg)
  const stat = statSync(filePath)
  if (stat.isDirectory()) {
    throw new Error('不支持删除目录，请指定文件路径')
  }
  unlinkSync(filePath)
  return `已删除文件: ${filePath}`
}

export function executeFsRead(args: Record<string, unknown>, context: ToolExecutionContext) {
  const pathArg = String(args.path ?? '')
  if (!pathArg) throw new Error('缺少 path')

  const filePath = sandboxFor(context).resolveInside(pathArg)
  if (!statSync(filePath).isFile()) throw new Error('目标不是文件')

  const content = readFileSync(filePath, 'utf-8')
  if (content.length > 100_000) {
    return `${content.slice(0, 100_000)}\n...(已截断)`
  }
  return content
}

export function executeFsWrite(args: Record<string, unknown>, context: ToolExecutionContext) {
  const pathArg = String(args.path ?? '')
  const content = String(args.content ?? '')
  if (!pathArg) throw new Error('缺少 path')

  const sandbox = sandboxFor(context)
  const filePath = sandbox.resolveInside(pathArg)
  const parent = resolve(filePath, '..')
  if (existsSync(parent)) {
    sandbox.validateRealPath(realpathSync.native(parent))
  } else {
    sandbox.validateExistingOrParent(parent)
  }
  mkdirSync(parent, { recursive: true })
  writeFileSync(filePath, content, 'utf-8')
  return `已写入文件: ${filePath}`
}

export function executeFsList(args: Record<string, unknown>, context: ToolExecutionContext) {
  const sandbox = sandboxFor(context)
  const dirPath = args.path ? sandbox.resolveDirectory(String(args.path)) : sandbox.rootReal

  const entries = readdirSync(dirPath, { withFileTypes: true })
  return entries
    .filter((entry) => sandbox.isSafeDirectoryEntry(dirPath, entry.name))
    .map((entry) => `${entry.isDirectory() ? '[dir]' : '[file]'} ${entry.name}`)
    .join('\n')
}
