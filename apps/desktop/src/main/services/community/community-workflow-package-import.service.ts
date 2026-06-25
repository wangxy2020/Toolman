import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'

import {
  validateWorkflowGraph,
  WorkflowMarketManifestSchema,
} from './adapters/workflow-market.adapter'
import {
  assertZipSource,
  isCommunityReadyPackage,
  readJsonFile,
  runCommunityPackageImport,
  slugifyCommunityId,
  type PrepareCommunityPackageResult,
} from './community-package-import.util'

const WORKFLOW_MANIFEST_FILENAME = 'workflow.manifest.json'
const GRAPH_CANDIDATES = ['workflow.json', 'graph.json', 'langgraph.json', 'flow.json']

const PrepareInputSchema = z.object({
  packagePath: z.string().min(1),
  title: z.string().optional(),
})

function isLanggraphGraphFile(absolutePath: string): boolean {
  try {
    const parsed = JSON.parse(readFileSync(absolutePath, 'utf8')) as unknown
    validateWorkflowGraph('langgraph', parsed)
    return true
  } catch {
    return false
  }
}

function findWorkflowGraphPath(packageRoot: string): string | null {
  for (const candidate of GRAPH_CANDIDATES) {
    const absolutePath = join(packageRoot, candidate)
    if (existsSync(absolutePath) && isLanggraphGraphFile(absolutePath)) {
      return candidate
    }
  }

  for (const entry of readdirSync(packageRoot, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue
    if (entry.name === WORKFLOW_MANIFEST_FILENAME) continue
    const relativePath = entry.name
    if (isLanggraphGraphFile(join(packageRoot, relativePath))) {
      return relativePath
    }
  }

  return null
}

function inferManifestFromGraph(packageRoot: string, fallbackTitle?: string): Record<string, unknown> {
  const graphPath = findWorkflowGraphPath(packageRoot)
  if (!graphPath) {
    throw new Error(
      '无法从该 zip 识别工作流。请确认压缩包内含 workflow.json 等 LangGraph 图文件，或已是 Toolman 社区包（含 workflow.manifest.json）。',
    )
  }

  const graph = readJsonFile<Record<string, unknown>>(join(packageRoot, graphPath))
  if (!graph) {
    throw new Error(`工作流图文件无法解析：${graphPath}`)
  }
  validateWorkflowGraph('langgraph', graph)

  const workflowId = slugifyCommunityId(
    fallbackTitle?.trim() || graphPath.replace(/\.json$/i, '') || 'workflow',
  )

  return WorkflowMarketManifestSchema.parse({
    schemaVersion: 1,
    workflowId,
    engine: 'langgraph',
    graphPath,
    requiredMcpIds: [],
    requiredSkillIds: [],
  }) as Record<string, unknown>
}

function ensureGraphExists(packageRoot: string, graphPath: string): void {
  const absolutePath = join(packageRoot, graphPath)
  if (!existsSync(absolutePath)) {
    throw new Error(`工作流包缺少图文件：${graphPath}`)
  }
  const graph = readJsonFile(absolutePath)
  if (!graph) {
    throw new Error(`工作流图文件无法解析：${graphPath}`)
  }
  validateWorkflowGraph('langgraph', graph)
}

export async function prepareCommunityWorkflowPackage(
  input: unknown,
): Promise<PrepareCommunityPackageResult> {
  const parsed = PrepareInputSchema.parse(input)
  const sourcePath = parsed.packagePath
  assertZipSource(sourcePath, '工作流资源包')

  return runCommunityPackageImport({
    sourcePath,
    title: parsed.title,
    resourceLabel: '工作流资源包',
    zipLabel: '工作流压缩包',
    stagingPrefix: 'toolman-workflow-import-',
    rootMarkers: [WORKFLOW_MANIFEST_FILENAME, ...GRAPH_CANDIDATES],
    manifestFilename: WORKFLOW_MANIFEST_FILENAME,
    packageExtension: '.toolman-workflow',
    zipBaseNamePrefix: 'community-workflow',
    packStagingPrefix: 'toolman-workflow-import-pack-',
    packLabel: '工作流资源',
    tryReturnReadyPackage(packageRoot) {
      if (!isCommunityReadyPackage(packageRoot, WORKFLOW_MANIFEST_FILENAME)) return null
      try {
        const existing = WorkflowMarketManifestSchema.parse(
          readJsonFile(join(packageRoot, WORKFLOW_MANIFEST_FILENAME)),
        )
        ensureGraphExists(packageRoot, existing.graphPath)
        return {
          packagePath: sourcePath,
          normalized: false,
          message: '资源包已符合 Toolman 社区工作流格式，可直接提交。',
        }
      } catch {
        return null
      }
    },
    resolveManifest({ packageRoot, title, manifestPath }) {
      if (existsSync(manifestPath)) {
        const existing = readJsonFile(manifestPath)
        if (!existing) {
          throw new Error('workflow.manifest.json 无法解析，请检查 JSON 格式')
        }
        const manifest = WorkflowMarketManifestSchema.parse(existing) as Record<string, unknown>
        ensureGraphExists(packageRoot, String(manifest.graphPath))
        return {
          manifest,
          generated: false,
          messageWhenNormalized: '已补全 SHA256SUMS 并转换为 .toolman-workflow 社区包。',
          messageWhenGenerated:
            '已从外部工作流 zip 自动生成 workflow.manifest.json 与 SHA256SUMS，并转换为 .toolman-workflow 社区包。',
        }
      }

      return {
        manifest: inferManifestFromGraph(packageRoot, title),
        generated: true,
        messageWhenNormalized: '已补全 SHA256SUMS 并转换为 .toolman-workflow 社区包。',
        messageWhenGenerated:
          '已从外部工作流 zip 自动生成 workflow.manifest.json 与 SHA256SUMS，并转换为 .toolman-workflow 社区包。',
      }
    },
  })
}
