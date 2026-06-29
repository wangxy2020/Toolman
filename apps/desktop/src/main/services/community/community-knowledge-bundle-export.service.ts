import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'

import { z } from 'zod'

import { getKnowledgeBaseRepository } from '../../db/repos'
import { listKnowledgeDocuments } from '../knowledge-document/list-ingest'

const ExportInputSchema = z.object({
  kbId: z.string().min(1),
  workspaceId: z.string().min(1).optional(),
})

function sha256Hex(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function sanitizeRelativeName(title: string, index: number, absolutePath: string): string {
  const ext = basename(absolutePath).includes('.')
    ? basename(absolutePath).slice(basename(absolutePath).lastIndexOf('.'))
    : ''
  const stem = title.trim().replace(/[^\w\u4e00-\u9fff.-]+/g, '_').slice(0, 80) || `file-${index + 1}`
  return `files/${stem}${ext}`
}

export async function exportCommunityKnowledgeBundle(input: unknown): Promise<{ packagePath: string }> {
  const { kbId, workspaceId } = ExportInputSchema.parse(input)
  const kbRepo = getKnowledgeBaseRepository()
  const kb = workspaceId
    ? kbRepo.findRowById(kbId, workspaceId)
    : kbRepo.findRowByIdOnly(kbId)
  if (!kb) {
    throw new Error('知识库不存在')
  }

  const documents = await listKnowledgeDocuments({
    kbId,
    workspaceId: kb.workspaceId,
  })
  const fileDocs = documents.filter((doc) => doc.absolutePath && existsSync(doc.absolutePath))
  if (fileDocs.length === 0) {
    throw new Error('知识库中没有可打包的文件，请先添加并索引文档')
  }

  const stagingRoot = mkdtempSync(join(tmpdir(), 'toolman-kb-export-'))
  const bundleRoot = join(stagingRoot, 'bundle')
  const filesDir = join(bundleRoot, 'files')
  mkdirSync(filesDir, { recursive: true })

  const manifestFiles: string[] = []
  const checksumLines: string[] = []

  try {
    for (const [index, doc] of fileDocs.entries()) {
      const absolutePath = doc.absolutePath!
      const relativePath = sanitizeRelativeName(doc.title, index, absolutePath)
      const targetPath = join(bundleRoot, relativePath)
      mkdirSync(dirname(targetPath), { recursive: true })
      copyFileSync(absolutePath, targetPath)
      manifestFiles.push(relativePath.replace(/\\/g, '/'))

      const bytes = readFileSync(targetPath)
      checksumLines.push(`${sha256Hex(bytes)}  ${relativePath.replace(/\\/g, '/')}`)
    }

    const manifest = {
      schemaVersion: 1,
      name: kb.name,
      description: kb.description ?? '',
      files: manifestFiles,
    }
    const manifestPath = join(bundleRoot, 'knowledge-bundle.manifest.json')
    const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`
    writeFileSync(manifestPath, manifestJson, 'utf8')
    checksumLines.push(`${sha256Hex(Buffer.from(manifestJson, 'utf8'))}  knowledge-bundle.manifest.json`)

    writeFileSync(join(bundleRoot, 'SHA256SUMS'), `${checksumLines.join('\n')}\n`, 'utf8')

    const zipPath = join(stagingRoot, `${kb.name.replace(/[^\w\u4e00-\u9fff.-]+/g, '_') || 'knowledge'}.zip`)
    execFileSync('zip', ['-r', zipPath, '.'], { cwd: bundleRoot })

    return { packagePath: zipPath }
  } catch (error) {
    rmSync(stagingRoot, { recursive: true, force: true })
    if (error instanceof Error && error.message.includes('ENOENT')) {
      throw new Error('系统未找到 zip 命令，无法打包知识库')
    }
    throw error
  }
}
