import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'

import {
  type StoredWorkflow,
  upsertStoredWorkflow,
} from '../workflow-store.service'

export const WorkflowMarketManifestSchema = z.object({
  schemaVersion: z.number().int().positive(),
  workflowId: z.string().min(1),
  engine: z.string().min(1),
  graphPath: z.string().min(1),
  requiredMcpIds: z.array(z.string()).optional(),
  requiredSkillIds: z.array(z.string()).optional(),
})

export type WorkflowMarketManifest = z.infer<typeof WorkflowMarketManifestSchema>

export interface WorkflowMarketInstallInput {
  manifest: Record<string, unknown>
  packagePath: string
  resourceId: string
  resourceTitle?: string
}

function sanitizeWorkflowId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}

function humanizeWorkflowId(workflowId: string): string {
  return workflowId
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function validateWorkflowGraph(engine: string, graph: unknown): void {
  if (engine !== 'langgraph') {
    throw new Error(`Unsupported workflow engine: ${engine}`)
  }
  if (!graph || typeof graph !== 'object' || Array.isArray(graph)) {
    throw new Error('Workflow graph must be a JSON object')
  }

  const object = graph as Record<string, unknown>
  if (Array.isArray(object.nodes)) {
    if (object.nodes.length === 0) {
      throw new Error('Workflow graph must contain at least one node')
    }
    for (const node of object.nodes) {
      if (!node || typeof node !== 'object' || Array.isArray(node)) {
        throw new Error('Workflow graph nodes must be objects')
      }
    }
    return
  }

  if (object.graph && typeof object.graph === 'object' && !Array.isArray(object.graph)) {
    return
  }

  throw new Error('Workflow graph must include nodes or graph')
}

export function readWorkflowGraphFromPackage(
  packagePath: string,
  graphPath: string,
): Record<string, unknown> {
  const absoluteGraphPath = join(packagePath, graphPath)
  if (!existsSync(absoluteGraphPath)) {
    throw new Error(`Workflow package is missing graph file: ${graphPath}`)
  }

  try {
    const parsed = JSON.parse(readFileSync(absoluteGraphPath, 'utf8')) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Workflow graph must be a JSON object')
    }
    return parsed as Record<string, unknown>
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Workflow')) {
      throw error
    }
    throw new Error(`Failed to parse workflow graph: ${graphPath}`)
  }
}

export function installWorkflowFromMarketPackage(input: WorkflowMarketInstallInput): StoredWorkflow {
  const manifest = WorkflowMarketManifestSchema.parse(input.manifest)
  const packagePath = input.packagePath.trim()

  if (!packagePath) {
    throw new Error('Workflow package path is empty')
  }
  if (!existsSync(packagePath)) {
    throw new Error('Workflow package directory does not exist')
  }

  const graph = readWorkflowGraphFromPackage(packagePath, manifest.graphPath)
  validateWorkflowGraph(manifest.engine, graph)

  const workflowId = sanitizeWorkflowId(manifest.workflowId)
  if (!workflowId) {
    throw new Error('Workflow manifest workflowId is invalid')
  }

  return upsertStoredWorkflow({
    id: workflowId,
    name: input.resourceTitle?.trim() || humanizeWorkflowId(manifest.workflowId),
    description: `Imported from Community Hub`,
    engine: manifest.engine,
    graph,
    graphPath: manifest.graphPath,
    sourcePackagePath: packagePath,
    communityResourceId: input.resourceId,
    requiredMcpIds: manifest.requiredMcpIds ?? [],
    requiredSkillIds: manifest.requiredSkillIds ?? [],
  })
}
