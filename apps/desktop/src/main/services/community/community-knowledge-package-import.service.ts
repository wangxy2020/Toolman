import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'

import { KnowledgeBundleManifestSchema } from './adapters/knowledge-bundle.adapter'
import {
  assertZipSource,
  isCommunityReadyPackage,
  listRelativeFiles,
  readJsonFile,
  runCommunityPackageImport,
  slugifyCommunityId,
  type PrepareCommunityPackageResult,
} from './community-package-import.util'

const KNOWLEDGE_MANIFEST_FILENAME = 'knowledge-bundle.manifest.json'

const PrepareInputSchema = z.object({
  packagePath: z.string().min(1),
  title: z.string().optional(),
})

function listKnowledgePayloadFiles(packageRoot: string): string[] {
  return listRelativeFiles(packageRoot).filter(
    (file) => file !== 'SHA256SUMS' && file !== KNOWLEDGE_MANIFEST_FILENAME,
  )
}

function syncKnowledgeManifestFiles(
  packageRoot: string,
  manifest: Record<string, unknown>,
  fallbackTitle?: string,
): Record<string, unknown> {
  const files = listKnowledgePayloadFiles(packageRoot)
  if (files.length === 0) {
    throw new Error('知识库包内没有可发布的文件，请使用「从本地知识库打包」或选择有效 zip')
  }

  const name =
    (typeof manifest.name === 'string' && manifest.name.trim()) ||
    fallbackTitle?.trim() ||
    'Community Knowledge'

  return KnowledgeBundleManifestSchema.parse({
    schemaVersion: 1,
    name,
    description: typeof manifest.description === 'string' ? manifest.description : '',
    files,
  }) as Record<string, unknown>
}

export async function prepareCommunityKnowledgePackage(
  input: unknown,
): Promise<PrepareCommunityPackageResult> {
  const parsed = PrepareInputSchema.parse(input)
  const sourcePath = parsed.packagePath
  assertZipSource(sourcePath, '知识库资源包')

  return runCommunityPackageImport({
    sourcePath,
    title: parsed.title,
    resourceLabel: '知识库资源包',
    zipLabel: '知识库压缩包',
    stagingPrefix: 'toolman-knowledge-import-',
    rootMarkers: [KNOWLEDGE_MANIFEST_FILENAME, 'files'],
    manifestFilename: KNOWLEDGE_MANIFEST_FILENAME,
    packageExtension: '.zip',
    zipBaseNamePrefix: 'community-knowledge',
    packStagingPrefix: 'toolman-knowledge-import-pack-',
    packLabel: '知识库资源',
    tryReturnReadyPackage(packageRoot) {
      if (!isCommunityReadyPackage(packageRoot, KNOWLEDGE_MANIFEST_FILENAME)) return null
      try {
        const existing = readJsonFile<Record<string, unknown>>(
          join(packageRoot, KNOWLEDGE_MANIFEST_FILENAME),
        )
        if (!existing) return null
        const hasFiles =
          Array.isArray(existing.files) &&
          existing.files.some((item) => typeof item === 'string' && item.trim().length > 0)
        if (!hasFiles) return null
        syncKnowledgeManifestFiles(packageRoot, existing, parsed.title)
        return {
          packagePath: sourcePath,
          normalized: false,
          message: '资源包已符合 Toolman 社区知识库格式，可直接提交。',
        }
      } catch {
        return null
      }
    },
    resolveManifest({ packageRoot, title, manifestPath }) {
      if (existsSync(manifestPath)) {
        const existing = readJsonFile(manifestPath)
        if (!existing) {
          throw new Error('knowledge-bundle.manifest.json 无法解析，请检查 JSON 格式')
        }
        return {
          manifest: syncKnowledgeManifestFiles(packageRoot, existing as Record<string, unknown>, title),
          generated: false,
          messageWhenNormalized:
            '已补全 manifest files 与 SHA256SUMS，并转换为社区知识库包。',
          messageWhenGenerated:
            '已自动生成 knowledge-bundle.manifest.json 与 SHA256SUMS，并转换为社区知识库包。',
        }
      }

      return {
        manifest: syncKnowledgeManifestFiles(
          packageRoot,
          {
            schemaVersion: 1,
            name: title?.trim() || slugifyCommunityId(title ?? 'community-knowledge'),
            description: '',
          },
          title,
        ),
        generated: true,
        messageWhenNormalized:
          '已补全 manifest files 与 SHA256SUMS，并转换为社区知识库包。',
        messageWhenGenerated:
          '已自动生成 knowledge-bundle.manifest.json 与 SHA256SUMS，并转换为社区知识库包。',
      }
    },
  })
}
