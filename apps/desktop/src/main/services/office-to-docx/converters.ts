import { execFile } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { app } from 'electron'
import { parseFile, writePlainTextDocx } from '@toolman/knowledge'
import { resolveDocxCoreBinaryPath } from '../docx-core-paths'
import { pathExists } from './command'
import { resolveOfficeSourceKind } from './path-helpers'
import { OfficeToDocxError } from './types'

const execFileAsync = promisify(execFile)

export async function convertWithDocxCore(inputPath: string, outputPath: string): Promise<void> {
  const binary = resolveDocxCoreBinaryPath()
  if (!binary) {
    throw new OfficeToDocxError('未找到 toolman-docx-core')
  }

  const cacheDir = join(app.getPath('userData'), 'cache', 'docx-conversions')
  await mkdir(cacheDir, { recursive: true })

  await execFileAsync(
    binary,
    ['convert', '--input', inputPath, '--output', outputPath, '--cache-dir', cacheDir],
    { timeout: 180_000 },
  )

  if (!(await pathExists(outputPath))) {
    throw new OfficeToDocxError('toolman-docx-core 未生成 docx 文件')
  }
}

export async function convertWithPlainText(
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
