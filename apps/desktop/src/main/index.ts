import { loadWorkspaceEnvFiles } from './bootstrap/load-env'

loadWorkspaceEnvFiles()

import { app, shell, BrowserWindow } from 'electron'
import { join } from 'node:path'

const e2eUserDataDir = process.env.TOOLMAN_E2E_USER_DATA_DIR
if (e2eUserDataDir) {
  app.setPath('userData', e2eUserDataDir)
}
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
import { ensureLocalDisplayNameSyncedToP2pMembers } from './services/identity.service'
import { startP2pDiscovery, stopP2pDiscovery } from './services/p2p/p2p-discovery.service'
import {
  startP2pNetworkManager,
  stopP2pNetworkManager,
} from './services/p2p/p2p-network-manager.service'
import {
  startCommunityYjsBridge,
} from './services/community/community-yjs-bridge.service'
import { stopCommunityYjsProvider } from './services/community/community-yjs-provider'
import {
  startCommunityCidProvider,
  stopCommunityCidProvider,
} from './services/community/community-cid-provider.service'
import { Libp2pBridge } from './services/p2p/libp2p-bridge'
import { startP2pConnectionMonitor, stopP2pConnectionMonitor } from './services/p2p/p2p-connection.service'
import { bootstrapP2pWorkspaceKeys } from './services/p2p/p2p-workspace.service'
import { bootstrapP2pEventStore } from './services/p2p/p2p-event.service'
import { bootstrapP2pSync } from './services/p2p/p2p-sync.service'
import { bootstrapP2pAgentRelay } from './services/p2p/p2p-agent-relay.service'
import {
  bootstrapCommunityHub,
  shutdownCommunityHub,
} from './services/community/community-bridge.service'
import { isAuthOAuthPopupUrl } from './services/auth/auth-oauth-popup'
import {
  attachRendererCrashHandler,
  bootstrapLocalOperations,
  registerProcessCrashHandlers,
} from './services/local-operations.service'
import { bootstrapAppUpdateService } from './services/app-update.service'
import { bootstrapCrashReportService } from './services/crash-report.service'
import { recordDiagnosticEvent } from './services/diagnostics-log'

registerProcessCrashHandlers()

const ELECTRON_CHROME_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

app.commandLine.appendSwitch('lang', 'zh-CN')
app.userAgentFallback = ELECTRON_CHROME_USER_AGENT

const isDev = !app.isPackaged

function shouldBlockInAppNavigation(url: string): boolean {
  // OAuth 授权页只允许在独立弹窗中打开，禁止替换主窗口内容。
  if (isAuthOAuthPopupUrl(url)) return true

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

function logLibp2pNativeStatus(): void {
  try {
    const message = Libp2pBridge.ping()
    const version = Libp2pBridge.version()
    console.log(`[libp2p] native module ready (${version}): ${message}`)
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : String(error)
    console.warn(`[libp2p] native module unavailable: ${errMessage}`)
  }
}

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

  const showFallbackTimer = setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      console.warn('[window] ready-to-show timeout; forcing show')
      mainWindow.show()
      mainWindow.focus()
    }
  }, 8_000)

  mainWindow.on('ready-to-show', () => {
    clearTimeout(showFallbackTimer)
    mainWindow?.show()
    mainWindow?.focus()
  })

  attachRendererCrashHandler(mainWindow.webContents)

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(
      `[window] failed to load ${validatedURL}: ${errorCode} ${errorDescription}`,
    )
    recordDiagnosticEvent('window', 'error', `load failed ${validatedURL}: ${errorCode} ${errorDescription}`)
    mainWindow?.show()
  })

  mainWindow.webContents.on('did-finish-load', () => {
    const url = mainWindow?.webContents.getURL()
    if (!url || !isAuthOAuthPopupUrl(url)) return

    console.warn('[auth] OAuth page loaded in main window; restoring app shell')
    if (isDev && process.env['ELECTRON_RENDERER_URL']) {
      void mainWindow?.loadURL(process.env['ELECTRON_RENDERER_URL'])
      return
    }
    void mainWindow?.loadFile(join(__dirname, '../renderer/index.html'))
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (isAuthOAuthPopupUrl(details.url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          parent: mainWindow ?? undefined,
          width: 480,
          height: 720,
          autoHideMenuBar: true,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
          },
        },
      }
    }
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('did-create-window', (childWindow, details) => {
    if (!isAuthOAuthPopupUrl(details.url)) return
    childWindow.webContents.setUserAgent(ELECTRON_CHROME_USER_AGENT)
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
  bootstrapLocalOperations()

  if (process.platform === 'win32') {
    app.setAppUserModelId('dev.toolman.app')
  }

  try {
    bootstrapDatabase()
    ensureP2pDeviceIdentity()
    ensureLocalDisplayNameSyncedToP2pMembers()
    try {
      startP2pDiscovery()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`[p2p] discovery bootstrap failed: ${message}`)
    }
    try {
      startP2pNetworkManager()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`[libp2p] network bootstrap failed: ${message}`)
    }
    void startCommunityYjsBridge().catch((error) => {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`[community-yjs] bootstrap failed: ${message}`)
    })
    void startCommunityCidProvider().catch((error) => {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`[community-cid] bootstrap failed: ${message}`)
    })
    bootstrapP2pEventStore()
    bootstrapP2pWorkspaceKeys()
    bootstrapMcpPresets()
    bootstrapSkills()
    bootstrapChannels()
    registerIpcHandlers()
    bootstrapAppUpdateService()
    bootstrapCrashReportService()
    bootstrapP2pSync()
    bootstrapP2pAgentRelay()
    startP2pConnectionMonitor()
    logP2pNativeStatus()
    logLibp2pNativeStatus()
    startHeartbeatScheduler()
    bootstrapKnowledgeWatchers()
    resumePendingIngestJobs()
    startKnowledgeUrlRefreshScheduler()
  } catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error)
    console.error(`[bootstrap] failed: ${message}`)
  }

  createWindow()

  void bootstrapCommunityHub().then((status) => {
    if (status.running) {
      console.log(`[community-hub] ready at ${status.baseUrl}`)
    } else if (status.error) {
      console.warn(`[community-hub] unavailable: ${status.error}`)
    }
    void import('./services/crash-report.service')
      .then(({ flushPendingCrashReports }) => flushPendingCrashReports())
      .catch(() => undefined)
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    } else {
      mainWindow?.show()
      mainWindow?.focus()
    }
  })
}).catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error)
  console.error(`[app] whenReady failed: ${message}`)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  stopAllKnowledgeWatchers()
  stopKnowledgeUrlRefreshScheduler()
  stopP2pDiscovery()
  stopP2pNetworkManager()
  stopCommunityYjsProvider()
  stopCommunityCidProvider()
  stopP2pConnectionMonitor()
  void shutdownCommunityHub()
  void disconnectAllMcpServers()
  void shutdownChannels()
  destroyAllBrowserSessions()
})
