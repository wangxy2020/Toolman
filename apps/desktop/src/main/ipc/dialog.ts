import { copyFileSync, existsSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import { BrowserWindow, dialog } from 'electron'
import { homedir } from 'node:os'
import {
  DialogSaveFileInputSchema,
  DialogSaveFileOutputSchema,
  DialogSelectFolderInputSchema,
  DialogSelectFolderOutputSchema,
  DialogSelectFilesInputSchema,
  DialogSelectFilesOutputSchema,
  DialogSelectFilesOrFoldersInputSchema,
  DialogSelectFilesOrFoldersOutputSchema,
  ipcOk,
} from '@toolman/shared'

function resolveDefaultPath(requested?: string): string {
  return requested ?? homedir()
}

export async function selectFolder(input: unknown) {
  const data = DialogSelectFolderInputSchema.parse(input ?? {})
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]

  const result = await dialog.showOpenDialog(win ?? undefined, {
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: resolveDefaultPath(data.defaultPath),
    title: '选择工作区文件夹',
    buttonLabel: '选择',
  })

  const path = result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
  return ipcOk(DialogSelectFolderOutputSchema.parse({ path }))
}

export async function selectFiles(input: unknown) {
  const data = DialogSelectFilesInputSchema.parse(input ?? {})
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]

  const result = await dialog.showOpenDialog(win ?? undefined, {
    properties: data.multiple === false ? ['openFile'] : ['openFile', 'multiSelections'],
    defaultPath: resolveDefaultPath(data.defaultPath),
    title: '选择文件',
    buttonLabel: '选择',
  })

  const paths = result.canceled ? [] : result.filePaths
  return ipcOk(DialogSelectFilesOutputSchema.parse({ paths }))
}

export async function selectFilesOrFolders(input: unknown) {
  const data = DialogSelectFilesOrFoldersInputSchema.parse(input ?? {})
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]

  const result = await dialog.showOpenDialog(win ?? undefined, {
    properties: ['openFile', 'openDirectory', 'multiSelections'],
    defaultPath: resolveDefaultPath(data.defaultPath),
    title: '选择文件或文件夹',
    buttonLabel: '选择',
  })

  const items = result.canceled
    ? []
    : result.filePaths.map((path) => {
        const stat = statSync(path)
        return { path, isDirectory: stat.isDirectory() }
      })

  return ipcOk(DialogSelectFilesOrFoldersOutputSchema.parse({ items }))
}

export async function saveFile(input: unknown) {
  const data = DialogSaveFileInputSchema.parse(input ?? {})
  if (!existsSync(data.sourcePath)) {
    return ipcOk(DialogSaveFileOutputSchema.parse({ saved: false, path: null }))
  }

  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  const defaultName = data.defaultFileName ?? basename(data.sourcePath)
  const result = await dialog.showSaveDialog(win ?? undefined, {
    defaultPath: join(resolveDefaultPath(data.defaultPath), defaultName),
    title: '另存为',
  })

  if (result.canceled || !result.filePath) {
    return ipcOk(DialogSaveFileOutputSchema.parse({ saved: false, path: null }))
  }

  copyFileSync(data.sourcePath, result.filePath)
  return ipcOk(DialogSaveFileOutputSchema.parse({ saved: true, path: result.filePath }))
}
