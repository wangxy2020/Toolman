import { eq, isNull } from 'drizzle-orm'
import { app } from 'electron'
import {
  WorkspaceGetInputSchema,
  WorkspaceSchema,
  WorkspaceSettingsSchema,
  WorkspaceUpdateInputSchema,
  type Workspace,
} from '@toolman/shared'
import { workspaces } from '@toolman/db'
import { getDatabase } from '../bootstrap/database'

function toWorkspace(row: typeof workspaces.$inferSelect): Workspace {
  const settings = WorkspaceSettingsSchema.parse(JSON.parse(row.settingsJson))
  return WorkspaceSchema.parse({
    id: row.id,
    name: row.name,
    isDefault: row.isDefault,
    settings,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  })
}

export function listWorkspaces(): Workspace[] {
  const db = getDatabase()
  const rows = db.select().from(workspaces).where(isNull(workspaces.deletedAt)).all()
  return rows.map(toWorkspace)
}

export function getWorkspace(input: unknown): Workspace | null {
  const { id } = WorkspaceGetInputSchema.parse(input)
  const db = getDatabase()
  const row = db.select().from(workspaces).where(eq(workspaces.id, id)).get()
  if (!row || row.deletedAt) return null
  return toWorkspace(row)
}

export function getDefaultWorkspace(): Workspace | null {
  const db = getDatabase()
  const row = db.select().from(workspaces).where(eq(workspaces.isDefault, true)).get()
  if (!row || row.deletedAt) return null

  const workspace = toWorkspace(row)
  if (workspace.settings.folderPath) return workspace

  return updateWorkspace({
    id: workspace.id,
    settings: { folderPath: app.getPath('documents') },
  })
}

export function updateWorkspace(input: unknown): Workspace | null {
  const data = WorkspaceUpdateInputSchema.parse(input)
  const db = getDatabase()
  const row = db.select().from(workspaces).where(eq(workspaces.id, data.id)).get()
  if (!row || row.deletedAt) return null

  const currentSettings = WorkspaceSettingsSchema.parse(JSON.parse(row.settingsJson))
  const nextSettings = data.settings ? { ...currentSettings, ...data.settings } : currentSettings
  const now = new Date()

  db.update(workspaces)
    .set({
      name: data.name ?? row.name,
      settingsJson: JSON.stringify(nextSettings),
      updatedAt: now,
    })
    .where(eq(workspaces.id, data.id))
    .run()

  return getWorkspace({ id: data.id })
}
