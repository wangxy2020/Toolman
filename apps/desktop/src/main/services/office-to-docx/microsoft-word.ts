import { rm } from 'node:fs/promises'
import { platform } from 'node:os'
import { pathExists, runCommand, whichBinary } from './command'
import { OfficeToDocxError } from './types'

/** wdFormatXMLDocument — Word 2007+ docx */
export const WORD_DOCX_FILE_FORMAT = 12

export async function findMicrosoftWordMac(): Promise<boolean> {
  if (platform() !== 'darwin') return false
  return pathExists('/Applications/Microsoft Word.app')
}

export async function findMicrosoftWordWindows(): Promise<boolean> {
  if (platform() !== 'win32') return false
  return (await whichBinary('winword')) != null
}

function escapeAppleScriptPath(filePath: string): string {
  return filePath.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

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
export async function convertWithMicrosoftWordMac(sourcePath: string, outputPath: string): Promise<void> {
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

export async function convertWithMicrosoftWordWindows(
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
