import {
  PmProjectCreateInputSchema,
  PmProjectDeleteInputSchema,
  PmProjectGetInputSchema,
  PmProjectListInputSchema,
  PmProjectUpdateInputSchema,
} from '@toolman/shared'
import { PmProjectRepository } from '@toolman/db'

import { getDatabase } from '../../bootstrap/database'
import { ensurePmDemoProjects } from './pm-seed.service'

function getRepo(): PmProjectRepository {
  return new PmProjectRepository(getDatabase())
}

export function listPmProjects(input: unknown) {
  const data = PmProjectListInputSchema.parse(input)
  // Demo portfolio is shared across menus (6 projects), not cloned per domain.
  ensurePmDemoProjects(data.workspaceId, data.domain)
  const projects = getRepo().listByWorkspace(data.workspaceId, {
    // Ignore domain filter so workbench / plan / cost all see the same portfolio.
    limit: data.limit,
  })
  return { projects }
}

export function getPmProject(input: unknown) {
  const data = PmProjectGetInputSchema.parse(input)
  const project = getRepo().getById(data.id)
  if (!project) {
    throw new Error('项目不存在')
  }
  return project
}

export function createPmProject(input: unknown) {
  const data = PmProjectCreateInputSchema.parse(input)
  return getRepo().create({
    workspaceId: data.workspaceId,
    code: data.code,
    name: data.name,
    status: data.status,
    domain: data.domain,
    workspaceRoot: data.workspaceRoot,
    description: data.description,
    metadata: data.metadata,
  })
}

export function updatePmProject(input: unknown) {
  const data = PmProjectUpdateInputSchema.parse(input)
  const updated = getRepo().update(data.id, {
    code: data.code,
    name: data.name,
    status: data.status,
    domain: data.domain,
    workspaceRoot: data.workspaceRoot,
    description: data.description,
    metadata: data.metadata,
  })
  if (!updated) {
    throw new Error('项目不存在')
  }
  return updated
}

export function deletePmProject(input: unknown) {
  const data = PmProjectDeleteInputSchema.parse(input)
  const deleted = getRepo().softDelete(data.id)
  if (!deleted) {
    throw new Error('项目不存在')
  }
  return { ok: true as const }
}
