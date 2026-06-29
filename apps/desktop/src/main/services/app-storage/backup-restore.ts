import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, dialog } from 'electron'
import { assertValidRestoreBackupPath } from './stats'
import { BACKUP_MANIFEST_VERSION } from './types'

export async function backupAppData(input?: { notesDataJson?: string }) {
  const result = await dialog.showOpenDialog({
    title: '选择备份保存位置',
    properties: ['openDirectory', 'createDirectory'],
  })

  if (result.canceled || result.filePaths.length === 0) {
    throw new Error('已取消备份')
  }

  const userData = app.getPath('userData')
  const dbPath = join(userData, 'toolman.db')
  if (!existsSync(dbPath)) {
    throw new Error('未找到数据库文件')
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupRoot = join(result.filePaths[0]!, `toolman-backup-${timestamp}`)
  mkdirSync(backupRoot, { recursive: true })

  cpSync(dbPath, join(backupRoot, 'toolman.db'))

  const knowledgeDir = join(userData, 'knowledge')
  let includesKnowledge = false
  if (existsSync(knowledgeDir)) {
    cpSync(knowledgeDir, join(backupRoot, 'knowledge'), { recursive: true })
    includesKnowledge = true
  }

  let includesNotes = false
  if (input?.notesDataJson) {
    writeFileSync(join(backupRoot, 'notes-data.json'), input.notesDataJson, 'utf8')
    includesNotes = true
  }

  const p2pWorkspacesDir = join(userData, 'p2p-workspaces')
  let includesP2pWorkspaces = false
  if (existsSync(p2pWorkspacesDir)) {
    cpSync(p2pWorkspacesDir, join(backupRoot, 'p2p-workspaces'), { recursive: true })
    includesP2pWorkspaces = true
  }

  const notesAttachmentsDir = join(userData, 'notes-attachments')
  let includesNotesAttachments = false
  if (existsSync(notesAttachmentsDir)) {
    cpSync(notesAttachmentsDir, join(backupRoot, 'notes-attachments'), { recursive: true })
    includesNotesAttachments = true
  }

  writeFileSync(
    join(backupRoot, 'manifest.json'),
    JSON.stringify(
      {
        version: BACKUP_MANIFEST_VERSION,
        createdAt: Date.now(),
        includesKnowledge,
        includesNotes,
        includesP2pWorkspaces,
        includesNotesAttachments,
        dbPath: 'toolman.db',
        knowledgePath: includesKnowledge ? 'knowledge' : null,
        notesPath: includesNotes ? 'notes-data.json' : null,
        p2pWorkspacesPath: includesP2pWorkspaces ? 'p2p-workspaces' : null,
        notesAttachmentsPath: includesNotesAttachments ? 'notes-attachments' : null,
      },
      null,
      2,
    ),
    'utf8',
  )

  return {
    backupPath: backupRoot,
    includesKnowledge,
    includesNotes,
    includesP2pWorkspaces,
    includesNotesAttachments,
    manifestVersion: BACKUP_MANIFEST_VERSION,
  }
}

export async function restoreAppData(input: { backupPath: string; restoreKnowledge?: boolean }) {
  assertValidRestoreBackupPath(input.backupPath)

  const userData = app.getPath('userData')
  const dbPath = join(userData, 'toolman.db')

  if (statSync(input.backupPath).isFile()) {
    cpSync(input.backupPath, dbPath)
    return { restored: true, includesKnowledge: false, requiresRestart: true }
  }

  const bundleDb = join(input.backupPath, 'toolman.db')
  if (!existsSync(bundleDb)) {
    throw new Error('备份包中未找到 toolman.db')
  }

  cpSync(bundleDb, dbPath)

  let includesKnowledge = false
  const knowledgeBackup = join(input.backupPath, 'knowledge')
  if (input.restoreKnowledge !== false && existsSync(knowledgeBackup)) {
    const knowledgeDir = join(userData, 'knowledge')
    if (existsSync(knowledgeDir)) {
      rmSync(knowledgeDir, { recursive: true, force: true })
    }
    cpSync(knowledgeBackup, knowledgeDir, { recursive: true })
    includesKnowledge = true
  }

  const p2pBackup = join(input.backupPath, 'p2p-workspaces')
  if (existsSync(p2pBackup)) {
    const p2pDir = join(userData, 'p2p-workspaces')
    if (existsSync(p2pDir)) {
      rmSync(p2pDir, { recursive: true, force: true })
    }
    cpSync(p2pBackup, p2pDir, { recursive: true })
  }

  const attachmentsBackup = join(input.backupPath, 'notes-attachments')
  if (existsSync(attachmentsBackup)) {
    const attachmentsDir = join(userData, 'notes-attachments')
    if (existsSync(attachmentsDir)) {
      rmSync(attachmentsDir, { recursive: true, force: true })
    }
    cpSync(attachmentsBackup, attachmentsDir, { recursive: true })
  }

  let notesDataJson: string | undefined
  const notesBackup = join(input.backupPath, 'notes-data.json')
  if (existsSync(notesBackup)) {
    notesDataJson = readFileSync(notesBackup, 'utf8')
  }

  return { restored: true, includesKnowledge, notesDataJson, requiresRestart: true }
}
