import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { z } from 'zod'

import {
  validateWorkflowGraph,
  WorkflowMarketManifestSchema,
} from './adapters/workflow-market.adapter'
import {
  assertZipSource,
  extractZip,
  isCommunityReadyPackage,
  readJsonFile,
  repackDirectory,
  resolvePackageRoot,
  safeZipBaseName,
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

  const stagingRoot = mkdtempSync(join(tmpdir(), 'toolman-workflow-import-'))
  const extractDir = join(stagingRoot, 'extract')
  try {
    extractZip(sourcePath, extractDir, '工作流压缩包')
    const packageRoot = resolvePackageRoot(extractDir, [
      WORKFLOW_MANIFEST_FILENAME,
      ...GRAPH_CANDIDATES,
    ])

    if (isCommunityReadyPackage(packageRoot, WORKFLOW_MANIFEST_FILENAME)) {
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
        // fall through to regenerate checksums / manifest fixes
      }
    }

    const manifestPath = join(packageRoot, WORKFLOW_MANIFEST_FILENAME)
    let manifest: Record<string, unknown>
    let generatedManifest = false

    if (existsSync(manifestPath)) {
      const existing = readJsonFile(manifestPath)
      if (!existing) {
        throw new Error('workflow.manifest.json 无法解析，请检查 JSON 格式')
      }
      manifest = WorkflowMarketManifestSchema.parse(existing) as Record<string, unknown>
      ensureGraphExists(packageRoot, String(manifest.graphPath))
    } else {
      manifest = inferManifestFromGraph(packageRoot, parsed.title)
      generatedManifest = true
    }

    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

    const zipFileName = `${safeZipBaseName(sourcePath, parsed.title, 'community-workflow')}.toolman-workflow`
    const repacked = repackDirectory({
      sourceDir: packageRoot,
      zipFileName,
      stagingPrefix: 'toolman-workflow-import-pack-',
      zipCommandLabel: '工作流资源',
    })

    const message = generatedManifest
      ? '已从外部工作流 zip 自动生成 workflow.manifest.json 与 SHA256SUMS，并转换为 .toolman-workflow 社区包。'
      : '已补全 SHA256SUMS 并转换为 .toolman-workflow 社区包。'

    return {
      packagePath: repacked.packagePath,
      normalized: true,
      message,
    }
  } finally {
    rmSync(stagingRoot, { recursive: true, force: true })
  }
}
