import { access, copyFile, mkdir, readdir, rm } from 'node:fs/promises'
import { constants } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import { spawn } from 'node:child_process'
import { platform, tmpdir } from 'node:os'

import { parseFile, resolveFileKind, type SupportedFileKind, writePlainTextDocx } from '@toolman/knowledge'

export type OfficeToDocxMethod = 'copy' | 'libreoffice' | 'microsoft-word' | 'plaintext'

export interface OfficeConversionCapabilities {
  libreOffice: boolean
  microsoftWordMac: boolean
  microsoftWordWindows: boolean
}

export class OfficeToDocxError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OfficeToDocxError'
  }
}

const LEGACY_WORD_EXTENSIONS = new Set(['.doc', '.wps'])

export function isNativeDocxPath(filePath: string, fileName?: string): boolean {
  const kind = resolveFileKind({ path: filePath, fileName })
  return kind === 'docx'
}

export function isLegacyWordPath(filePath: string, fileName?: string): boolean {
  const kind = resolveFileKind({ path: filePath, fileName })
  return kind === 'doc' || kind === 'wps'
}

export function isFormatPreservingConversionMethod(method: OfficeToDocxMethod): boolean {
  return method === 'copy' || method === 'libreoffice' || method === 'microsoft-word'
}

export function hasMicrosoftWordInstalled(capabilities: OfficeConversionCapabilities): boolean {
  return capabilities.microsoftWordMac || capabilities.microsoftWordWindows
}

export function hasFormatPreservingConverter(capabilities: OfficeConversionCapabilities): boolean {
  return capabilities.libreOffice || hasMicrosoftWordInstalled(capabilities)
}

/** 仅当本机未安装 Word 时，才允许纯文本兜底（避免 Word 已装但自动化失败时静默丢格式） */
export function shouldAllowPlaintextFallback(capabilities: OfficeConversionCapabilities): boolean {
  return !hasMicrosoftWordInstalled(capabilities)
}

export function docxWorkingStem(fileName: string): string {
  const base = basename(fileName)
  const ext = extname(base).toLowerCase()
  const stem = LEGACY_WORD_EXTENSIONS.has(ext) || ext === '.docx' ? base.slice(0, -ext.length) : base
  return stem.replace(/[^\w\u4e00-\u9fff.-]+/g, '_').slice(0, 80) || 'document'
}

export function resolveOfficeSourceKind(sourcePath: string, fileName: string): SupportedFileKind | null {
  return resolveFileKind({ path: sourcePath, fileName })
}

export function buildLegacyWordConversionStatusMessage(options: {
  fileName: string
  workingName: string
  method: Exclude<OfficeToDocxMethod, 'copy'>
  capabilities: OfficeConversionCapabilities
}): string {
  const { fileName, workingName, method, capabilities } = options
  const wordInstalled = hasMicrosoftWordInstalled(capabilities)

  switch (method) {
    case 'libreoffice':
      return wordInstalled
        ? `已通过 LibreOffice 将「${fileName}」转换为 docx：${workingName}`
        : `未检测到 Microsoft Word，已通过 LibreOffice 将「${fileName}」转换为 docx：${workingName}`
    case 'microsoft-word':
      return `已通过 Microsoft Word 将「${fileName}」转换为 docx：${workingName}`
    case 'plaintext':
      if (!hasFormatPreservingConverter(capabilities)) {
        return `未检测到 Word/LibreOffice，已将「${fileName}」转为纯文本 docx（目录/格式/批注会丢失）：${workingName}。建议安装 LibreOffice 或上传 .docx。`
      }
      return `LibreOffice 转换失败且未安装 Word，已将「${fileName}」降级为纯文本 docx（目录/格式/批注会丢失）：${workingName}`
    default:
      return `已将「${fileName}」转换为 docx：${workingName}`
  }
}

/** blob 暂存路径无扩展名时，复制为带原始文件名的临时文件供转换器识别 */
export async function ensureNamedSourceForConversion(
  sourcePath: string,
  fileName: string,
): Promise<{ inputPath: string; cleanup?: () => Promise<void> }> {
  const safeName = basename(fileName).replace(/[^\w\u4e00-\u9fff.\- ()（）]+/g, '_') || 'document.doc'
  const nameExt = extname(safeName).toLowerCase()
  const pathExt = extname(basename(sourcePath)).toLowerCase()

  if (nameExt && pathExt === nameExt) {
    return { inputPath: sourcePath }
  }

  if (!nameExt) {
    return { inputPath: sourcePath }
  }

  const tempDir = join(tmpdir(), `toolman-office-src-${Date.now()}`)
  await mkdir(tempDir, { recursive: true })
  const inputPath = join(tempDir, safeName)
  await copyFile(sourcePath, inputPath)

  return {
    inputPath,
    cleanup: async () => {
      await rm(tempDir, { recursive: true, force: true })
    },
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

async function findLibreOfficeBinary(): Promise<string | null> {
  const candidates =
    platform() === 'darwin'
      ? [
          '/Applications/LibreOffice.app/Contents/MacOS/soffice',
          '/Applications/LibreOffice.app/Contents/MacOS/soffice.bin',
        ]
      : platform() === 'win32'
        ? [
            String.raw`C:\Program Files\LibreOffice\program\soffice.exe`,
            String.raw`C:\Program Files (x86)\LibreOffice\program\soffice.exe`,
          ]
        : ['soffice', 'libreoffice']

  for (const candidate of candidates) {
    if (candidate.includes('/') || candidate.includes('\\')) {
      if (await pathExists(candidate)) return candidate
      continue
    }
    const resolved = await whichBinary(candidate)
    if (resolved) return resolved
  }
  return null
}

function whichBinary(name: string): Promise<string | null> {
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

function runCommand(
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

async function convertWithLibreOffice(
  sourcePath: string,
  outputPath: string,
): Promise<void> {
  const binary = await findLibreOfficeBinary()
  if (!binary) {
    throw new OfficeToDocxError('未找到 LibreOffice')
  }

  const tempDir = join(dirname(outputPath), `.toolman-lo-${Date.now()}`)
  await mkdir(tempDir, { recursive: true })

  try {
    await runCommand(
      binary,
      ['--headless', '--convert-to', 'docx', '--outdir', tempDir, sourcePath],
      { timeoutMs: 120_000 },
    )

    const sourceStem = basename(sourcePath, extname(sourcePath))
    const convertedPath = join(tempDir, `${sourceStem}.docx`)
    if (!(await pathExists(convertedPath))) {
      const files = await readdir(tempDir)
      const docxFile = files.find((file) => file.toLowerCase().endsWith('.docx'))
      if (!docxFile) {
        throw new OfficeToDocxError('LibreOffice 未生成 docx 文件')
      }
      await copyFile(join(tempDir, docxFile), outputPath)
      return
    }

    await copyFile(convertedPath, outputPath)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}

async function findMicrosoftWordMac(): Promise<boolean> {
  if (platform() !== 'darwin') return false
  return pathExists('/Applications/Microsoft Word.app')
}

async function findMicrosoftWordWindows(): Promise<boolean> {
  if (platform() !== 'win32') return false
  return (await whichBinary('winword')) != null
}

export async function detectOfficeConversionCapabilities(): Promise<OfficeConversionCapabilities> {
  return {
    libreOffice: (await findLibreOfficeBinary()) != null,
    microsoftWordMac: await findMicrosoftWordMac(),
    microsoftWordWindows: await findMicrosoftWordWindows(),
  }
}

export { findMicrosoftWordMac }

function escapeAppleScriptPath(filePath: string): string {
  return filePath.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

/** wdFormatXMLDocument — Word 2007+ docx */
const WORD_DOCX_FILE_FORMAT = 12

export function buildMicrosoftWordMacConversionScript(
  sourcePath: string,
  outputPath: string,
): string {
  const inputPosix = escapeAppleScriptPath(sourcePath)
  const outputPosix = escapeAppleScriptPath(outputPath)

  return `set inputPath to POSIX file "${inputPosix}"
set outputPath to POSIX file "${outputPosix}"
tell application "Microsoft Word"
  set display alerts to false
  open inputPath
  set docRef to active document
  try
    save as docRef file name outputPath file format ${WORD_DOCX_FILE_FORMAT}
    close docRef saving no
  on error errMsg number errNum
    try
      close docRef saving no
    end try
    error errMsg number errNum
  end try
end tell`
}

/**
 * 通过 Microsoft Word 另存为 docx。
 * 必须使用 numeric file format（12）；`format XML document` 会在 AppleScript 中报语法错误。
 */
async function convertWithMicrosoftWordMac(sourcePath: string, outputPath: string): Promise<void> {
  if (!(await findMicrosoftWordMac())) {
    throw new OfficeToDocxError('未找到 Microsoft Word')
  }

  await rm(outputPath, { force: true })

  const script = buildMicrosoftWordMacConversionScript(sourcePath, outputPath)
  await runCommand('osascript', ['-e', script], { timeoutMs: 180_000 })

  if (!(await pathExists(outputPath))) {
    throw new OfficeToDocxError('Microsoft Word 未生成 docx 文件')
  }
}

function escapePowerShellSingleQuoted(value: string): string {
  return value.replace(/'/g, "''")
}

async function convertWithMicrosoftWordWindows(
  sourcePath: string,
  outputPath: string,
): Promise<void> {
  if (!(await findMicrosoftWordWindows())) {
    throw new OfficeToDocxError('未找到 Microsoft Word')
  }

  await rm(outputPath, { force: true })

  const inputPath = escapePowerShellSingleQuoted(sourcePath)
  const outPath = escapePowerShellSingleQuoted(outputPath)
  const script = [
    '$word = New-Object -ComObject Word.Application',
    '$word.Visible = $false',
    '$word.DisplayAlerts = 0',
    'try {',
    `  $doc = $word.Documents.Open('${inputPath}')`,
    `  $doc.SaveAs([ref]'${outPath}', [ref]${WORD_DOCX_FILE_FORMAT})`,
    '  $doc.Close()',
    '} finally {',
    '  $word.Quit()',
    '  [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($word)',
    '}',
  ].join('; ')

  await runCommand('powershell', ['-NoProfile', '-Command', script], { timeoutMs: 180_000 })

  if (!(await pathExists(outputPath))) {
    throw new OfficeToDocxError('Microsoft Word 未生成 docx 文件')
  }
}

async function convertWithPlainText(
  sourcePath: string,
  outputPath: string,
  fileName: string,
): Promise<void> {
  const kind = resolveOfficeSourceKind(sourcePath, fileName)
  if (kind !== 'doc' && kind !== 'wps') {
    throw new OfficeToDocxError(`无法以纯文本方式转换: ${fileName}`)
  }

  if (kind === 'wps') {
    throw new OfficeToDocxError(
      '未能转换 WPS 文件：请安装 LibreOffice，或在 WPS 中另存为 .docx 后重新上传',
    )
  }

  const parsed = await parseFile(sourcePath, { kind: 'doc' })
  await writePlainTextDocx(outputPath, parsed.plainText)
}

type FormatPreservingConverter = {
  method: Exclude<OfficeToDocxMethod, 'copy' | 'plaintext'>
  available: boolean
  convert: (inputPath: string, outputPath: string) => Promise<void>
  unavailableReason: string
}

function buildFormatPreservingConverters(
  capabilities: OfficeConversionCapabilities,
): FormatPreservingConverter[] {
  const converters: FormatPreservingConverter[] = [
    {
      method: 'libreoffice',
      available: capabilities.libreOffice,
      convert: convertWithLibreOffice,
      unavailableReason: '未找到 LibreOffice',
    },
  ]

  if (platform() === 'darwin') {
    converters.push({
      method: 'microsoft-word',
      available: capabilities.microsoftWordMac,
      convert: convertWithMicrosoftWordMac,
      unavailableReason: '未找到 Microsoft Word',
    })
  }

  if (platform() === 'win32') {
    converters.push({
      method: 'microsoft-word',
      available: capabilities.microsoftWordWindows,
      convert: convertWithMicrosoftWordWindows,
      unavailableReason: '未找到 Microsoft Word',
    })
  }

  return converters
}

/**
 * 将 Word 源文件准备为 MCP 可用的 docx。
 * - `.docx`：直接复制到 targetDocxPath
 * - `.doc` / `.wps`：转换为 docx 并写入 targetDocxPath（不保留中间副本）
 *
 * 无 Word 时的策略：LibreOffice（保留格式）→ 纯文本 docx（仅 .doc，会丢格式）。
 * 已装 Word 但自动化失败时：不静默降级为纯文本，需用户授权或手动另存为 .docx。
 */
export async function materializeDocxForMcp(options: {
  sourcePath: string
  fileName: string
  targetDocxPath: string
}): Promise<{ method: OfficeToDocxMethod; capabilities: OfficeConversionCapabilities }> {
  const { sourcePath, fileName, targetDocxPath } = options
  await mkdir(dirname(targetDocxPath), { recursive: true })

  if (isNativeDocxPath(sourcePath, fileName)) {
    const capabilities = await detectOfficeConversionCapabilities()
    await copyFile(sourcePath, targetDocxPath)
    return { method: 'copy', capabilities }
  }

  if (!isLegacyWordPath(sourcePath, fileName)) {
    throw new OfficeToDocxError(`不支持的 Word 源格式：${fileName}`)
  }

  const capabilities = await detectOfficeConversionCapabilities()
  const errors: string[] = []
  const staged = await ensureNamedSourceForConversion(sourcePath, fileName)

  try {
    const inputPath = staged.inputPath

    for (const converter of buildFormatPreservingConverters(capabilities)) {
      if (!converter.available) {
        errors.push(converter.unavailableReason)
        continue
      }

      try {
        await converter.convert(inputPath, targetDocxPath)
        return { method: converter.method, capabilities }
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error))
      }
    }

    if (shouldAllowPlaintextFallback(capabilities)) {
      try {
        await convertWithPlainText(inputPath, targetDocxPath, fileName)
        return { method: 'plaintext', capabilities }
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error))
      }
    } else {
      errors.push(
        platform() === 'darwin'
          ? '已安装 Microsoft Word，但自动转换失败。请在「系统设置 → 隐私与安全性 → 自动化」中允许 Toolman 控制 Microsoft Word，或在 Word 中手动另存为 .docx 后重新上传。'
          : '已安装 Microsoft Word，但自动转换失败。请确认 Word 可正常打开该文件，或手动另存为 .docx 后重新上传。',
      )
    }
  } finally {
    await staged.cleanup?.()
  }

  const noWordHint = hasMicrosoftWordInstalled(capabilities)
    ? ''
    : '本机未安装 Word：可安装 LibreOffice（推荐，保留格式）或直接上传 .docx。'

  throw new OfficeToDocxError(
    [
      `无法将「${fileName}」转换为 docx。`,
      noWordHint,
      '建议：在 Word/WPS 中另存为 .docx，或安装 LibreOffice 后重试。',
      ...errors.map((item) => `- ${item}`),
    ]
      .filter(Boolean)
      .join('\n'),
  )
}
