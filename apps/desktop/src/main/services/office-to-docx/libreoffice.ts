import { copyFile, mkdir, readdir, rm } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { platform } from 'node:os'
import { pathExists, runCommand, whichBinary } from './command'
import { OfficeToDocxError } from './types'

export async function findLibreOfficeBinary(): Promise<string | null> {
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

export async function convertWithLibreOffice(
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
