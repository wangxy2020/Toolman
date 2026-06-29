import { copyFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { platform } from 'node:os'
import { toErrorMessage } from '@toolman/shared'
import { resolveDocxCoreBinaryPath } from '../docx-core-paths'
import { convertWithDocxCore, convertWithPlainText } from './converters'
import { findLibreOfficeBinary, convertWithLibreOffice } from './libreoffice'
import {
  findMicrosoftWordMac,
  findMicrosoftWordWindows,
  convertWithMicrosoftWordMac,
  convertWithMicrosoftWordWindows,
} from './microsoft-word'
import {
  ensureNamedSourceForConversion,
  hasMicrosoftWordInstalled,
  isLegacyWordPath,
  isNativeDocxPath,
  shouldAllowPlaintextFallback,
} from './path-helpers'
import type { OfficeConversionCapabilities, OfficeToDocxMethod } from './types'
import { OfficeToDocxError } from './types'

export async function detectOfficeConversionCapabilities(): Promise<OfficeConversionCapabilities> {
  return {
    libreOffice: (await findLibreOfficeBinary()) != null,
    microsoftWordMac: await findMicrosoftWordMac(),
    microsoftWordWindows: await findMicrosoftWordWindows(),
  }
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
      method: 'office-oxide',
      available: Boolean(resolveDocxCoreBinaryPath()),
      convert: convertWithDocxCore,
      unavailableReason: '未找到 toolman-docx-core',
    },
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
 * 无 Word 时的策略：Rust office_oxide → LibreOffice（保留格式）→ 纯文本 docx（仅 .doc，会丢格式）。
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
        errors.push(toErrorMessage(error, String(error)))
      }
    }

    if (shouldAllowPlaintextFallback(capabilities)) {
      try {
        await convertWithPlainText(inputPath, targetDocxPath, fileName)
        return { method: 'plaintext', capabilities }
      } catch (error) {
        errors.push(toErrorMessage(error, String(error)))
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
