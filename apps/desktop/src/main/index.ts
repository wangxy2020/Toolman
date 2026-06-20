import { app, shell, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { registerIpcHandlers } from './ipc/handlers'
import { bootstrapDatabase } from './bootstrap/database'
import { bootstrapSkills } from './services/skills-facade.service'
import { bootstrapMcpPresets } from './services/mcp-server-config.service'
import { bootstrapChannels, shutdownChannels } from './services/im-channel.facade.service'
import { startHeartbeatScheduler } from './services/heartbeat.service'
import { disconnectAllMcpServers } from './services/mcp-client-manager.service'
import { destroyAllBrowserSessions } from './services/browser-cdp.service'
import { bootstrapKnowledgeWatchers, stopAllKnowledgeWatchers } from './services/knowledge-watcher.service'
import { resumePendingIngestJobs } from './services/knowledge-ingest-resume.service'
import {
  startKnowledgeUrlRefreshScheduler,
  stopKnowledgeUrlRefreshScheduler,
} from './services/knowledge-url-refresh.service'
import { P2pBridge } from './services/p2p/p2p-bridge'
import { ensureP2pDeviceIdentity } from './services/p2p/p2p-device-identity.service'
import { startP2pConnectionMonitor, stopP2pConnectionMonitor } from './services/p2p/p2p-connection.service'
import { stopP2pDiscovery } from './services/p2p/p2p-discovery.service'
import { bootstrapP2pWorkspaceKeys } from './services/p2p/p2p-workspace.service'
import { bootstrapP2pEventStore } from './services/p2p/p2p-event.service'
import {
  bootstrapCommunityHub,
  shutdownCommunityHub,
} from './services/community/community-bridge.service'

app.commandLine.appendSwitch('lang', 'zh-CN')

const isDev = !app.isPackaged

function shouldBlockInAppNavigation(url: string): boolean {
  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    try {
      const target = new URL(url)
      const entry = new URL(process.env['ELECTRON_RENDERER_URL'])
      if (target.origin !== entry.origin) return true
      const entryPath = entry.pathname === '/' ? '/' : entry.pathname.replace(/\/$/, '')
      const targetPath = target.pathname.replace(/\/$/, '') || '/'
      return targetPath !== entryPath && targetPath !== '/'
    } catch {
      return true
    }
  }

  return !url.startsWith('file://')
}

let mainWindow: BrowserWindow | null = null

function logP2pNativeStatus(): void {
  try {
    const message = P2pBridge.ping()
    const version = P2pBridge.version()
    console.log(`[p2p] native module ready (${version}): ${message}`)
    const device = ensureP2pDeviceIdentity()
    console.log(
      `[p2p] device identity ready: ${device.deviceId} (fp=${device.publicKeyFingerprint})`,
    )
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : String(error)
    console.error(`[p2p] native module unavailable: ${errMessage}`)
  }
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'Toolman',
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 14, y: 11 } }
      : process.platform === 'win32'
        ? {
            titleBarStyle: 'hidden' as const,
            titleBarOverlay: {
              color: '#f5f5f5',
              symbolColor: '#1f2328',
              height: 40,
            },
          }
        : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (shouldBlockInAppNavigation(url)) {
      event.preventDefault()
      if (url.startsWith('http://') || url.startsWith('https://')) {
        void shell.openExternal(url)
      }
    }
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('dev.toolman.app')
  }

  bootstrapDatabase()
  ensureP2pDeviceIdentity()
  bootstrapP2pEventStore()
  bootstrapP2pWorkspaceKeys()
  bootstrapMcpPresets()
  bootstrapSkills()
  bootstrapChannels()
  registerIpcHandlers()
  startP2pConnectionMonitor()
  logP2pNativeStatus()
  startHeartbeatScheduler()
  bootstrapKnowledgeWatchers()
  resumePendingIngestJobs()
  startKnowledgeUrlRefreshScheduler()

  void bootstrapCommunityHub().then((status) => {
    if (status.running) {
      console.log(`[community-hub] ready at ${status.baseUrl}`)
    } else if (status.error) {
      console.warn(`[community-hub] unavailable: ${status.error}`)
    }
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  stopAllKnowledgeWatchers()
  stopKnowledgeUrlRefreshScheduler()
  stopP2pDiscovery()
  stopP2pConnectionMonitor()
  void shutdownCommunityHub()
  void disconnectAllMcpServers()
  void shutdownChannels()
  destroyAllBrowserSessions()
})
