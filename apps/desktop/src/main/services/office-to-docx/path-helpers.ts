import { copyFile, mkdir, rm } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { resolveFileKind, type SupportedFileKind } from '@toolman/knowledge'
import type { OfficeConversionCapabilities, OfficeToDocxMethod } from './types'

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
  return method === 'copy' || method === 'office-oxide' || method === 'libreoffice' || method === 'microsoft-word'
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
    case 'office-oxide':
      return `已通过 Rust 格式桥（office_oxide）将「${fileName}」转换为 docx：${workingName}`
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
