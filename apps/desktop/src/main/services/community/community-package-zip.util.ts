import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'

export function sha256Hex(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

export function writeCommunityZipPackage(input: {
  stagingPrefix: string
  zipFileName: string
  files: Record<string, string | Buffer>
}): { packagePath: string; stagingRoot: string } {
  const stagingRoot = mkdtempSync(join(tmpdir(), input.stagingPrefix))
  const bundleRoot = join(stagingRoot, 'bundle')
  mkdirSync(bundleRoot, { recursive: true })

  const checksumLines: string[] = []
  for (const [relativePath, content] of Object.entries(input.files)) {
    const normalizedPath = relativePath.replace(/\\/g, '/')
    const bytes = typeof content === 'string' ? Buffer.from(content, 'utf8') : content
    const targetPath = join(bundleRoot, normalizedPath)
    mkdirSync(dirname(targetPath), { recursive: true })
    writeFileSync(targetPath, bytes)
    checksumLines.push(`${sha256Hex(bytes)}  ${normalizedPath}`)
  }

  writeFileSync(join(bundleRoot, 'SHA256SUMS'), `${checksumLines.join('\n')}\n`, 'utf8')

  const zipPath = join(stagingRoot, input.zipFileName)
  try {
    execFileSync('zip', ['-r', zipPath, '.'], { cwd: bundleRoot })
  } catch (error) {
    rmSync(stagingRoot, { recursive: true, force: true })
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new Error('系统未找到 zip 命令，无法打包资源')
    }
    throw error
  }

  return { packagePath: zipPath, stagingRoot }
}
