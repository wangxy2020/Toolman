import { app, shell, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { logStructured } from './services/structured-log.service'
import { recordDiagnosticEvent } from './services/diagnostics-log'
import { attachRendererCrashHandler } from './services/local-operations.service'
import { isAuthOAuthPopupUrl } from './services/auth/auth-oauth-popup'

export const ELECTRON_CHROME_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

let mainWindow: BrowserWindow | null = null

function shouldBlockInAppNavigation(url: string): boolean {
  const isDev = !app.isPackaged

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

export function createWindow(): void {
  const isDev = !app.isPackaged
  const shouldShowImmediately = app.isPackaged

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: shouldShowImmediately,
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
      logStructured('window', 'warn', `ready-to-show timeout; forcing show`)
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
    logStructured('window', 'error', `failed to load ${validatedURL}: ${errorCode} ${errorDescription}`)
    recordDiagnosticEvent('window', 'error', `load failed ${validatedURL}: ${errorCode} ${errorDescription}`)
    mainWindow?.show()
  })

  mainWindow.webContents.on('did-finish-load', () => {
    const url = mainWindow?.webContents.getURL()
    if (!url || !isAuthOAuthPopupUrl(url)) return

    logStructured('auth', 'warn', `OAuth page loaded in main window; restoring app shell`)
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

export function showMainWindow(): void {
  mainWindow?.show()
  mainWindow?.focus()
}
